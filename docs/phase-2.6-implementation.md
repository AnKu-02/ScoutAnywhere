# Phase 2.6 — private listing submission and human moderation

## Boundary and lifecycle

Public discovery, demo data and public schema are unchanged. Approval means **Approved, not published**, not verified ownership, identity, brokerage credentials or permission over a public property. There is no publication API or email notification service.

Private working drafts remain independently editable and incompletely saveable. A submitted revision has five states:

| From | Action / actor | Result |
| --- | --- | --- |
| Eligible draft | Advertiser submits a ready snapshot | Pending review (`pending`) |
| Pending review | Different, explicitly authorized moderator | Approved / Changes requested / Rejected |
| Pending review | Its active advertiser | Withdrawn |
| Changes requested or Withdrawn | Advertiser submits another ready revision | New pending submission linked to previous revision |

Approved and rejected drafts cannot be reopened by this MVP. Rejection is final for that submitted revision; no reconsideration endpoint exists. An advertiser can create another draft, but this is not a reconsideration mechanism. Exactly one pending submission per draft is enforced by a partial unique index. Previous snapshots and feedback remain available even after working-draft deletion. Operator escalation is needed for suspended advertisers with pending reviews.

## Readiness policy `submission-v1`

Every category requires title, description of at least **40 characters and six words**, Bengaluru or Mumbai, locality, declared relationship and **one processed ready photograph**. This is a completeness policy, not authenticity verification. Missing monetary amounts are never defaulted to zero.

- Flatshares: private/shared bedroom arrangement, positive monthly rent, explicit deposit (zero allowed), availability date.
- Rent: apartment/independent-house type, BHK, positive monthly rent, explicit deposit, maintenance and brokerage (zero allowed).
- Buy: property type, BHK, positive asking price, carpet area, explicit brokerage (zero allowed).

Optional furnishing, addresses, household details and extra photos are not required. Existing draft schemas support integer BHK 1–10 only; studios/nonstandard configurations are **not currently supported**, and this phase does not invent a different contract. Broader configuration support needs coordinated draft/public schema work. Availability is required for flatshares, not rentals, matching the scoped minimums. Pending uploads must finish or expire and be cleaned before submission.

## Atomic immutable snapshots

Migration 010 adds `listing_submissions`, `submission_events`, `submission_write_limits`, and `moderator_access_events`; extends the existing operator-only capability foundation with `moderator`; and adds lifecycle/audit guards. Migration 011 adds database capture validation, linked-history enforcement, a deferred creation-event requirement, and capability-identity protection. Migrations 001–009 are unchanged.

Creation locks account → active non-demo advertiser/profile → draft → media state → ready photos in the existing mutation lock order. Both expected text/media versions must match. Text writes, upload reservations/finalization, cover/order edits, photo deletion and cleanup use compatible account/draft locks. Snapshot content and photo metadata are inserted in the same transaction with the actor-attributed initial event. No object copy or non-transactional snapshot assembly occurs.

Snapshots include source account/advertiser/draft IDs, advertiser display name, full category/property/unit/advertisement/relationship content, policy version, source text/media versions, server time, ordered immutable photo IDs/object keys, dimensions, byte sizes and cover designation. Normal runtime updates/deletes are blocked by triggers. Current working-draft content cannot alter them.

Account-scoped UUID request keys and normalized request hashes provide idempotent retries; different payloads conflict. One account can retain at most 1,000 submission receipts, requiring operator review before growth beyond MVP limits. Expected failed HTTP mutation attempts still consume a separate committed 30/minute account budget. Decision retries with identical actor/version/decision/reason return the recorded result. Different stale or competing decisions conflict; row locks and append-only events allow one final outcome.

## Photograph reference retention

The simplest compatible approach is **retention references to existing immutable private objects**, not copies. Snapshot JSON holds the object identity independent of mutable draft delivery URLs. Draft deletion immediately removes draft access, but the durable photo tombstone and object remain protected while any referencing submission is pending or has unexpired retention. Cleanup checks retention before selecting candidates and rechecks under the photo/account locks before exact-key deletion. Multiple references are evaluated independently. A live working-draft photo remains retained by its own working-draft obligation even after submission expiry.

| State | Default photograph retention |
| --- | --- |
| Pending review | While pending |
| Withdrawn / Changes requested / Rejected | 30 days after event |
| Approved, unpublished | 90 days after approval |

`SUBMISSION_TERMINAL_RETENTION_DAYS` configures terminal defaults (1–365 days); `SUBMISSION_APPROVED_RETENTION_DAYS` configures approvals (1–90 days). Defaults are captured by the terminal event, so changing environment configuration does not retroactively rewrite an obligation. Pending review has no automatic deadline: operators must resolve/withdraw stale reviews. These are provisional operational defaults, **not legal conclusions**.

Existing `media:cleanup` CLI/minute reconciler handles expired, deleted draft objects in bounded resumable batches. Failure keeps the tombstone for retry; no bucket-wide deletion occurs. Expired submissions deny photo delivery with 410 and show a retention-expired notice. Audit metadata, object identities and submitted text remain private; there is no public image URL, next/image optimization or anonymous media endpoint. Storage/root/provider cannot change without migration and reconciliation.

## Authorization and APIs

All private pages/routes require a Better Auth email-verified session. Ownership and human actors come from that session, never JSON. Active non-demo advertiser eligibility is required for advertiser reads and actions, including historical reads. Privileged moderator access is independent of advertiser type and administrator capability. Moderators cannot read/review their own submission through moderator routes. Every queue, detail, decision and image request rechecks permission; mutations hold a capability share lock, so revocation takes effect after any already-authorized transaction completes and on subsequent actions. Media delivery rechecks authorization after storage I/O.

- `/api/submissions`: own history GET; submission POST `{requestId,draftId,version,mediaVersion}`.
- `/api/submissions/[id]`: owned snapshot/events GET; withdrawal POST `{version,decision:"withdrawn",reason}`.
- `/api/submissions/[id]/photos/[photoId]`: authorized submitted image GET.
- `/api/listing-drafts/[id]/readiness`: persisted readiness/versions/latest submission GET.
- `/api/moderation?page=1`: protected oldest-first queue, 25/page, excluding self.
- `/api/moderation/[id]`: snapshot/events GET; decision POST `{version,decision,reason}`.
- `/api/moderation/[id]/photos/[photoId]`: moderator-authorized image GET.

Inputs are strict Zod objects, UUID/version bounded, mutation bodies limited to 4 KiB, reasons 5–2,000 trimmed characters with letters/numbers. Canonical Origin and JSON are required. Private/no-store, Cookie variation, noindex, no-referrer and same-origin image headers protect delivery. Errors do not expose SQL/storage details. Existing public routes cannot query this domain.

## Operator-controlled moderator setup

From `/Users/ananyakulkarni/Desktop/ScoutAnywhere`, use a trusted local operator database connection, not a web client:

```sh
node --env-file=.env --import tsx scripts/moderator-access.ts grant ACCOUNT_ID
node --env-file=.env --import tsx scripts/moderator-access.ts revoke ACCOUNT_ID
```

The account must already exist and be email verified. For an isolated test database, explicitly substitute `DATABASE_URL` with the verified `TEST_DATABASE_URL` before importing the script. Do not log credentials or grant a shared production connection to end users. Grant/revoke events record the database principal and timestamp. Trusted operator identity/access controls are an operational responsibility. There is no self-grant API, staff UI, public moderator registration or automatic administrator-to-moderator inheritance.

## Interface and manual acceptance

Use `/dashboard/listings` for statuses, current feedback and history; `/dashboard/moderation` for the protected queue. Authorized moderators also have a queue link from their account dashboard. Photos and review adds readiness, linked missing fields, private preview, confirmation and submission. Unsaved text must be saved first. Use **Check readiness** after photo edits. The API always revalidates regardless of displayed readiness. Review details show the exact snapshot, ordered gallery, itemized charges, declared relationship, policy, actor-attributed history and linked previous review. Every consequential action requires confirmation.

1. Register/verify two separate accounts through local Mailpit; create an advertiser profile on one; grant moderator on the other using the operator command.
2. Save an incomplete draft: saving succeeds, readiness lists missing requirements and cannot submit.
3. Complete category minimums and one image; check readiness; preview; confirm submission. My Listings shows Under review.
4. Edit saved text and remove/change photos. Open View submitted version: original title, photo order and cover remain unchanged.
5. Moderator opens queue/detail, requests changes with a reason. Advertiser sees feedback and creates a linked resubmission.
6. Approve that version. Advertiser sees Approved, not published. Public discovery remains demo-only.
7. Repeat with reject and withdrawal; try competing decisions, second-account access and moderator self-review. Revoke access and retry queue/detail/media/decision.
8. Test keyboard/focus and no overflow at 375, 768, 1440 pixels, then repeat on physical mobile/assistive technology. Run `npm run media:cleanup` with the correct environment and inspect backlog without logging private keys/images.

## Privacy and production gates

This phase does not implement account deletion, automated text redaction, audit pseudonymization or a complete privacy lifecycle. A database guard blocks deleting an account with pending submissions. Deleting a terminal account does not erase immutable review history: opaque actor/account IDs, advertiser display name and potentially personal information entered in descriptions/addresses remain. **An authorized privacy/redaction and backup-erasure process with defined audit/text retention is required before real customer data.** Photograph expiry is not complete personal-data erasure. Test fixtures leave historical audit/snapshot rows intentionally; tests do not disable append-only guards to erase history.

Retained submission objects may exceed the active-draft photo accounting; the 1,000 submission/account ceiling bounds receipts, not a production retained-byte quota. Add retained-storage quotas, stale-review monitoring, retention-index/query load testing, cleanup failure alerting, external scheduling, least-privilege runtime roles, backups/recovery and live private-S3 acceptance before launch. Production privacy/legal review is mandatory; do not process real customer information under these provisional defaults. Automated tests do not prove physical-device keyboard, screen-reader or live S3 acceptance. Exact time-passage physical cleanup under SQL clock and restart recovery requires additional operational acceptance; current tests cover retained references, expired delivery and existing cleanup recovery paths.

## Phase 2.7 mapping contract (not implemented)

Publishing must consume a specific approved immutable submission, never the mutable draft. Define approval expiry/re-review and an idempotent submission-to-publication mapping. Resolve normalized city/location/PIN/address/building and physical property/unit identity without inferring ownership or accepting arbitrary resource authority. Public units require furnishing/BHK/address data beyond current submission minimums. Handle draft room semantics, cost bounds and optional fields explicitly. Promote selected private images into a separate public object namespace with its own consent/cache/retention policy; never expose these private endpoints. Persist resource grants separately, `is_demo=false`, correct non-demo disclosures and a unique publication association. No such conversion is included here.