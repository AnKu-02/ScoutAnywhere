# Phase 2.3 — Advertiser accounts and permission boundaries

## Implemented scope

One Better Auth account can browse/save homes and optionally maintain one private advertiser profile. The selectable self-declared types are `owner` (Property Owner), `broker` (Broker / Real Estate Agent) and `tenant` (Existing Flatshare Tenant). They are descriptions of activity, not mutually exclusive account privileges or legal claims. This phase offers one primary advertiser type per profile; choosing a type does not change account interests or authentication. Developer records remain supported by the existing marketplace schema, but developer/agency setup, teams and organizations are not enabled.

The profile uses the account name as an editable initial suggestion, not a public disclosure of account data. It stores advertiser display name (2–80 characters), primary operating city (Bengaluru or Mumbai), optional description (0–600 characters), profile status and server dates. The form requests no email, telephone, documents, property address or property/listing IDs. No public profile directory or profile-by-ID endpoint exists; profile text is private and rendered as escaped text. Users are advised not to include contact details or sensitive data. No verification system is simulated.

## Three distinct concepts

1. **Account control:** the verified account allowed to edit a private advertiser profile.
2. **Property relationship/authorization:** a separately established relationship and grant for a particular physical property, unit or advertisement. None are granted in this phase.
3. **Verification:** an independently reviewed claim/evidence decision. Email confirmation, selecting a business type and active profile status are not identity, ownership, occupancy or broker verification.

Creating a profile never links it to existing demo advertisers/properties/listings or writes an account capability. Browsing/favorites remain usable without setup, including when a profile is suspended. There are no fake listing counts, verification badges or activity metrics.

## Migration 006 and lifecycle

`006_advertiser_profiles.sql` is forward-only; migrations 001–005 and seeds are unchanged.

- Existing `advertisers`: adds nullable unique `owner_user_id → auth_user.id ON DELETE CASCADE`; permits `tenant` alongside existing kinds. A CHECK prohibits an account owner on a demo entity. `(id,owner_user_id)` is unique to support the private extension's composite foreign key. Null ownership leaves all seeded and legacy advertisers untouched.
- `advertiser_profiles`: advertiser primary key, unique account ID, composite foreign key to the exact advertiser/account pair, city, short description, `active`/`suspended` status and server timestamps. Profile account/advertiser keys cannot be reassigned; a trigger preserves creation time and generates update time. Unique indexes provide account ownership lookup. Repository transactions create the entity and extension together; failure leaves neither partial record.
- `advertiser_status_events`: initial status and subsequent transitions, previous/current status, server timestamp, database principal. Indexed by profile/time/ID, written transactionally by a database trigger. No client actor/reason is accepted. This is database-principal attribution, not a full human moderation audit log. Ordinary edits do not generate fake status changes.
- `advertiser_profile_write_limits`: one bounded bucket/account, 20 valid mutation attempts per minute, stored atomically across application instances. PostgreSQL serializes same-account setup/updates using the parent user row lock. Expired windows reset on use; account deletion removes the limiter.

Deleting an account cascades its unreferenced advertiser, profile, status events and limiter. The existing listing-to-advertiser foreign key is restrictive: if future real advertisements reference an advertiser, deletion must fail rather than orphan them. No deletion endpoint exists today; a future deletion/retention policy must explicitly address listing retention, pseudonymization and audit retention before enabling one. Current status-event retention is profile/account lifetime, not immutable compliance storage.

## Status definitions

- **Active profile:** successfully saved and editable by its controlling account. Not reviewed or approved for advertising. No publishing/management right.
- **Suspended:** operator-disabled advertiser profile editing. It does not suspend the Better Auth account or browsing/favorites. Updates are rejected on the server, not merely disabled in the form. Setup cannot create another advertiser to bypass the unique relationship.

Status is not an editable field, and neither is verification. The API rejects extra fields (including `status`, `verified`, `role`, `capability`, account/advertiser/property/listing IDs). Initial active status is a database default. Operator changes are recorded even when made directly in SQL; there is no public status route.

## Server boundary

`/dashboard/advertiser` and the dashboard summary use `requireAccount`/verified Better Auth database sessions. The API independently checks its own session; hidden links never provide security.

- `GET /api/advertiser-profile`: current account's private projection or `profile:null`; anonymous/unverified/revoked sessions receive 401.
- `PUT /api/advertiser-profile`: create/update the current account's profile only; strict full-body Zod validation, JSON content type, canonical Origin, streamed 4KB body cap, no query parameters or caller IDs. Returns generic failures without logging payloads/credentials. Malformed text/JSON is rejected safely. Missing auth/SMTP configuration fails closed.

All responses are private/no-store, vary on Cookie and use no-referrer headers. Parameterized Postgres.js queries bind all runtime values. Repository functions accept internal account IDs for composability, but only session-derived IDs may cross the application boundary. The account row lock prevents duplicate concurrent setup; the profile row lock serializes status/edit races with operator changes. Name/type updates and extension changes commit atomically.

The reusable helpers are deliberately narrow:

- `canEditAdvertiserProfile(userId,advertiserId)`: exact controlling account, non-demo entity, active profile. The write repository separately rechecks/locks ownership and status; a prior helper read is not a write authorization token.
- `isAccountAdvertiserForListing(userId,listingId)`: non-demo advertiser/listing association for the active account profile. It is **association only**, not a management permission, and cannot claim or create a relationship.
- `canManageListing()` and `canPublishListing()`: always **false** in Phase 2.3. These are explicit feature gates, not a completed permission-grant system. Neither interests nor even an operator-assigned legacy advertiser/administrator capability bypasses them.

Marketplace search/listing repositories, cards, listing entry page and public advertiser projection are unchanged. The global demo banner refers to marketplace fixtures; private account profiles are user-supplied information, not fictional advertiser seeds.

## Future property relationships — proposal only

Do not infer property control from profile type, address matching, a supplied ID or the existing `listings.advertiser_id`. No property relationships or management-grant tables are added now; empty tables with self-service semantics would imply permissions that do not exist.

A later scoped design should separate:

- A property relationship claim: claimant advertiser, exact property/unit, claimed relationship (`owner`, `authorized-broker`, `authorized-flatshare-tenant`), submission time and lifecycle. A pending/self-declared claim grants nothing.
- A reviewed authorization grant: exact advertiser/resource, narrow operations, validity/revocation, authorized reviewer/operator and audit reference. Listing association remains distinct from permission to edit/publish a physical property or another advertisement.
- Verification decisions: evidence requirements/version, review result, reviewing authority, timestamps and expiry/review policy. Identity review is distinct from property authorization; broker registration alone is not an owner's delegation.

Future checks must resolve verified session → account-controlled active advertiser → exact resource grant → non-demo resource → operation and review/publication policy, with transaction-level checks at every mutation. A claim over an existing address/ID must never auto-create a grant. New submissions should start private/draft and pass a separately implemented publication policy. Do not expose any claim creation, moderation or publishing workflow until that scope has been reviewed.

Potential future evidence includes identity and ownership-related documents for owners; identity, business/registration information where applicable and owner authorization for brokers; occupancy and permission to advertise the room for flatshare tenants. Requirements must be configurable by jurisdiction/property/relationship and reviewed for the relevant Indian state, not hardcoded as universal legal requirements. No claims of legal compliance are made here. Future documents require private restricted storage, scanning, minimal access, consent, retention/deletion rules and audited review; none are collected today.

## Operator/administration guidance

There is no admin registration, bootstrap HTTP endpoint, admin dashboard or self-grant route. Preserve `account_capabilities` as operator-controlled only; advertiser setup never writes it. A future bootstrap should be a separately reviewed, local/operator-only command requiring explicit target account, grant/revoke operation, operator identity/reason, least-privilege connection and durable audit entry. Do not create automatic admin-by-email or first-signup grants.

For now, any exceptional profile status change requires a trusted operator transaction targeting an exact account/profile, an independent approval/change record, and a distinct traceable database principal. Lock account then profile in the same order as application writes, update only status, and inspect the generated event. Do not give clients this access. The database event records the principal; until a scoped admin actor/reason workflow exists, the independent change record supplies human accountability.

Production needs a dedicated runtime role. Grant only reviewed profile/name/type columns and required reads/inserts, not ownership transfer, status updates, capability grants or audit mutation. Trigger-based audit inserts need a reviewed narrowly scoped privilege arrangement (e.g. a hardened dedicated trigger owner/function); local development currently uses an elevated database role, so it is not a tamper-resistant administrative audit boundary. This phase does not alter deployment roles/services or claim protection from a compromised database owner. Ingress request/read throttling, operational monitoring, privacy/retention and security review remain launch prerequisites.

## Local manual validation

From the repository root, use existing ignored configuration and run `npm run db:migrate`. Start `npm run dev` only if port 3000 is unused. Use localhost consistently with the configured auth origin; Mailpit on localhost port 8025 captures verification mail locally rather than delivering to a real inbox.

1. Register/verify a synthetic test account or sign in with an existing verified local account.
2. Open Dashboard → Become an advertiser / Advertiser. Check that setup is optional and browsing/favorites still work without it.
3. Enter a display name, select owner/broker/flatshare tenant, choose Bengaluru/Mumbai and optionally describe your activity; create the profile.
4. Check the self-declaration notice, active-editing status and creation date. Edit the information. No property posting controls should appear.
5. Sign out/in and reopen Advertiser; confirm persistence. Try desktop and narrow mobile layouts.
6. In a separate browser context, sign in with another account. It must see its own setup/profile, not the first account's. Requests containing another account/advertiser ID or privileged fields must be rejected.

Automated browser tests use synthetic accounts and test-only trusted-IP buckets. Never trust client-supplied `x-scout-test-ip` outside the isolated test server. Run standard README commands; migrations and test fixtures must target the isolated seeded test database. See `phase-2.3-validation.md` for executed results.

## Deliberate limitations

Private single-account profiles only; one primary type and one launch city per profile. No documents, identity/broker/property verification, property claims, listing edits/submission/publishing, agency/team management, notifications, messages, payments, reviews or new integrations. No public profile/contact exposure or deletion/status-management UI. The account relationship is immutable rather than transferable. Profile-only suspension is not an account ban or a completed moderation workflow.