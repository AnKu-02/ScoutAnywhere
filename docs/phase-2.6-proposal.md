# Phase 2.6 submission and moderation — proposal only

Nothing in this document is implemented. Approval must never publish a listing or establish verified property rights.

## Proposed lifecycle

Private drafts remain editable staging records, not submission statuses. Each submission captures one immutable revision. Proposed states are `submitted`, `in_review`, `changes_requested`, `rejected`, `approved`, and `withdrawn`.

- Eligible advertiser: create `submitted` from an owned draft, or withdraw a pending submission.
- Authorized moderator: `submitted → in_review`; `in_review → changes_requested | rejected | approved`.
- `submitted | in_review → withdrawn` by the owner, subject to an agreed withdrawal policy.
- Decisions are terminal for that revision. Resubmission creates a new linked revision, never rewrites the reviewed snapshot.
- Approval is internal review completion only. No automatic transition into public `listings`, no public image URLs, and no publishing endpoint in Phase 2.6.

Transitions require expected submission version/state, transaction-level policy checks and account/profile rechecks. Submission requests need account-scoped idempotency receipts so retries cannot create multiple revisions. Concurrent moderator decisions must have one winner.

## Immutable content and photos

Capture normalized content, schema/policy version, draft ID/text version, media version, submitting account/advertiser and server timestamp in one transaction using the established account → advertiser/profile → draft → media lock order. Require the client's expected text AND media versions. Reject stale capture rather than silently reviewing different information. Account eligibility and resource ownership must be derived server-side.

Snapshot photos include processed ready photo identity, immutable object identity/checksum, dimensions, order and cover. Reject capture while relevant uploads are pending; the UI should explain how to finish/reload first. A text-only snapshot is not an equivalent photo snapshot.

Existing draft deletion and cleanup can reclaim image objects. Before enabling submission, introduce explicit retention references or copy-on-submit into a distinct private immutable namespace with durable copy reservations. Choose ONE model, with failure reconciliation and tests. Never retain only mutable draft URLs, toggle the private bucket public, or exempt arbitrary keys from cleanup. Moderator delivery must be authorized, no-store and excluded from the public optimizer. User deletion/withdrawal, terminal-decision retention, quotas and retention expiry require agreed policy. Existing owner-only photo URLs must remain owner-only.

## Editing and resubmission

Recommended: advertisers may keep editing their private working draft while a submission is pending, but the submitted revision never changes. Explain “working draft differs from submitted version.” Allow at most one pending submission per draft unless a deliberate replacement policy is agreed. Changes-requested resubmission links to the previous revision and preserves its feedback/history. Decide whether rejection permits resubmission and whether withdrawal allows later resubmission.

## Authorization and decision history

Use operator-controlled, explicitly granted moderation permission, not profile type, active advertiser status, preferences, email matching or first-user rules. Existing capability storage is a starting point, not a complete moderator policy. Grant/revoke requires an audited trusted operator process, least-privilege DB role and no self-grant endpoint. Define whether administrators automatically moderate or require a separate permission. Default deny self-review, including decisions on one's own submissions.

Append immutable events with submission/revision, previous/next state, authenticated actor ID, reason/feedback, policy version, timestamp and request correlation. Capture actor identity from the session, never the body. Database-principal attribution alone is insufficient. Decide retention/pseudonymization if an actor's account is removed. Queue access, snapshot reading, photograph delivery and every decision each require server authorization; hiding buttons is not enforcement.

Persist decision plus notification intent transactionally. A durable outbox/worker can deliver retryable advertiser notifications without holding locks while waiting on SMTP. Notification failure must not undo or duplicate a decision. UI notification/status history remains the source of truth.

## Later publication, deliberately separate

A future approved-revision-to-publication operation needs explicit property/unit resolution and resource grants. Never match an address and infer ownership, accept an arbitrary property ID as authority, reassign a property's owner, or duplicate property records on every retry. Persist a unique revision/publication association for idempotency.

Public schema mapping must address normalized city/locality/PIN/building, public integer bounds, shared-bedroom semantics, draft-only fields and explicit `is_demo=false`. Public pages currently assume demo disclosures and public images allow `/images/%`; reviewed public-media promotion and non-demo presentation need a separate scope. Public media must be copied/versioned deliberately into a public namespace, never served from private draft endpoints.

## Decisions required before implementation

1. Required fields, allowed cities, minimum photo count/scenes and policy versioning.
2. Retention-reference versus private snapshot-copy model; deletion and retention durations.
3. Pending-edit, withdrawal, rejection and resubmission rules.
4. Moderator permission granularity, self-review restrictions and operator bootstrap/revocation.
5. Feedback visibility, notification channels and actor-history retention.
6. Meaning/expiry of approval and explicit handoff to a later publishing phase.

Required tests: ownership and suspended-profile denial; moderator/anonymous/self-review denial; stale text/media capture; pending upload race; snapshot immutability; delete/cleanup retention; duplicate submission and decision retries; decision concurrency and audit attribution; notification failure/retry; public query and private-photo non-disclosure.