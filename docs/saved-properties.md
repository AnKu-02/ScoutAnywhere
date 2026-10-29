# Phase 2.2 — Saved Properties

## Model and ownership

Forward-only migration `005_saved_listings.sql` adds `saved_listings(user_id, listing_id, saved_at)` with a composite primary key, foreign keys to Better Auth's `auth_user` and marketplace `listings`, and ON DELETE CASCADE for both. Indexed account/time ordering supports private collection browsing; a listing index supports cascade cleanup. Times come from PostgreSQL. No property, price, image or private account information is copied into favorites. Saving an advertisement never grants editing rights or links the account to a fictional advertiser.

`src/modules/saved-listings` validates IDs, queries ownership and executes parameterized Postgres.js transactions. The account row is locked for mutations to serialize concurrent changes/cap checks. Source publication is checked with a shared row lock before insertion. PUT and DELETE are idempotent; uniqueness prevents duplicate saves. The companion `saved_listing_write_limits` table supplies an atomic rolling one-minute bucket (60 mutation requests/account). Both duplicate and removal requests count; the next expired window resets it. Collections are limited to 500 relationships/account and displayed 12/page, newest first. Hidden relationships count toward this cap.

## HTTP boundary

- `GET /api/saved-listings`: published saved IDs for the current verified session only, or `{authenticated:false,ids:[]}` for anonymous users. No user ID or arbitrary query parameters accepted. This response is presentation state, not a public collection API.
- `PUT /api/saved-listings`: save `{listingId:number}`.
- `DELETE /api/saved-listings`: remove the same exact body shape, only for the current session.

Writes require configured Better Auth, a verified database session, exact canonical Origin and application/json; request bodies are streamed with a 1KB cap and strictly validated. Extra fields/user IDs are rejected. IDs are bounded positive PostgreSQL integers. Every response is private/no-store and varies on Cookie. Auth/DB failures return generic unavailable feedback without logging private contents. No new auth endpoints, roles or privileges are enabled. Client pending locks prevent duplicate clicks; the database remains authoritative under concurrent clients. Server arrival order determines the last state for opposing writes.

## Visibility and lifecycle

The existing marketplace has only `published`, `draft`, `archived`, and only published records are publicly readable. Favorites use precisely that policy:

- Published: current detail projection is reused, including costs/category/location.
- Draft/archived (including any future moderation action represented by those states): hidden completely, with no title, location or hidden count disclosed. New saves are refused with the same response as a nonexistent ID. Original private relationships remain, so republishing makes the bookmark visible again.
- Deleted: database cascades the relationship away, without dashboard errors.
- There is no independent unavailable/rented/sold flag today. No availability badges are fabricated. All existing seed listings remain fictional and not available to rent/buy. A future availability or moderation schema must explicitly extend the shared publication/access policy before being exposed through favorites.

IDs and public projection are fetched in bounded queries; projection rechecks publication if it changed between queries. Pagination counts may briefly differ during concurrent unpublishing; reload reconciles them. A hidden relationship can still be removed by its owning account via DELETE, but hidden listing details and removal controls are not exposed in the UI. A future account-management policy may add bulk-clear/hidden-record management; no such workflow is added here.

## UI and sign-in intent

The existing card and detail page use one Lucide bookmark control, semantic Electric Calm tokens, 44px minimum targets, aria-pressed state, keyboard focus, pending disabling and polite status/error feedback. A shared lightweight React context holds only in-memory presentation state; it does not replace server authorization or store sessions in browser storage. Successful writes update all controls and refresh the saved dashboard. BroadcastChannel invalidation refreshes other active tabs; tab activation rechecks state. Unsupported browsers refresh on tab visibility/navigation; there is no cross-device realtime push.

`/dashboard/saved` requires a verified server session and reuses full PropertyCards, Indian currency formatting and demonstration disclosures. Account overview/navigation link to it; other placeholders remain unavailable. Empty collections show “You haven't saved any properties yet.” with a browse action. Database errors do not masquerade as an empty collection.

Anonymous bookmark attempts go to `/sign-in?next=/listings/{id}` (URL encoded). Both server/client validate next against an explicit internal allowlist, rejecting external URLs, encoded paths and arbitrary query strings. Sign-in returns to the listing and requires another explicit Save property action. No deferred automatic mutation is performed. This return intent currently applies to direct sign-in; starting a new registration/verification/reset flow does not persist the return path, and users can reopen the original listing afterward.

## Local testing

Use the existing ignored auth `.env` and loopback Mailpit configuration. From `/home/chiragd/Desktop/ScoutAnywhere`, run `docker compose up -d --wait`, `npm run db:migrate`, then use the existing development server (do not start a second against the same workspace). Apply migration 005 to the isolated seeded test database too. No new credentials or external services are needed.

1. Visit any category and select Save property while signed out; confirm the sign-in prompt and internal listing return destination.
2. Sign in with a verified local account (Mailpit verification viewer: localhost port 8025); confirm the listing is still unsaved until explicitly selected.
3. Save one listing of each category. Open `/dashboard/saved` through account navigation and check current cards/costs.
4. Open a card, remove from details/cards/dashboard, and check another open tab updates.
5. Sign out/in to check persistence. Use a separate browser context with a second account and check that its collection is independent.
6. On an isolated test fixture only, archive/unpublish/delete the source and verify no hidden information leaks. Never modify real user listings merely for a test.

Run README's lint/typecheck/unit/integration/build/Playwright commands. The isolated browser server explicitly trusts a synthetic `x-scout-test-ip` header only to segregate the new journey from the existing deliberate abuse-limit test. Never configure that client-controlled header as trusted on a deployed origin; deployment still requires an ingress-overwritten header and blocked direct access. No existing tests were removed or skipped. Existing responsive image selectors were scoped to visible route content to exclude React-retained hidden/prefetched DOM; all layout, image, typography and keyboard assertions remain intact. Stop the development server before production build/testing against the same workspace; do not concurrently reuse `.next` output.

## Limitations

No alerts, email notifications, saved searches, posting, uploads, permissions, contact sharing, messaging or verification workflows are included. Database credentials still require production hardening/least privilege, privacy/retention review and deployment security review described in `authentication.md`. Limits bound application writes and state payloads, not volumetric unauthenticated traffic; ingress read/request throttling and load tests remain production work. Browser checks are Chrome desktop/mobile emulation, not a comprehensive accessibility audit or cross-browser certification.