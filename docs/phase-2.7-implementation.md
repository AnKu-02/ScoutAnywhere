# Phase 2.7 — controlled public publication

## Boundary and authority

Approval **does not publish**. Publication consumes one specifically approved immutable submission, never a working draft. It does not verify ownership, identity, tenancy rights, brokerage credentials, authenticity or current availability. No advertiser self-publishing, public editing, replacement, automatic publication, geocoding, messaging or payment is implemented.

`publisher` is a separate operator-controlled `account_capabilities` grant. Moderators, administrators, advertiser kinds, account interests and active profiles do not inherit it. All operator pages, queue/detail/photo API reads and writes require a verified session and a current database grant. Publishing one's own submission is forbidden even with a grant. An independently reviewed moderator and publisher may be the same person if explicitly granted both; the browser journey uses separate accounts.

From the repository root, with the intended local environment:

```sh
node --env-file=.env --import tsx scripts/publisher-access.ts grant ACCOUNT_ID
node --env-file=.env --import tsx scripts/publisher-access.ts revoke ACCOUNT_ID
```

The command requires an existing verified account, locks its row and records grant/revocation in append-only `publisher_access_events` attributed to the database principal. There is no self-grant endpoint, first-user grant or email allowlist. Human change-control attribution for CLI grants is an operational responsibility, as for moderator grants. Mutations and private reads lock the capability for their transaction: committed revocations affect subsequent actions; an already authorized in-flight transaction finishes before a conflicting revocation commits. Production needs least-privilege runtime credentials excluding capability writes and audit updates; a database owner can defeat triggers.

## Forward migrations

- **012_controlled_publication.sql:** publisher grant/audit, publication reservations, media receipts, action events, lifecycle guards, public snapshot advertiser name/relationship/disclosures, image cover designation. Maintenance becomes nullable for sales because sale drafts do not collect it; existing values/default zero remain intact for compatibility. No maintenance amount is invented for a new sale listing.
- **013_publication_integrity.sql:** approved reservation identity validation, terminal transition protection, deterministic source-photo/media receipt constraints, verified media completeness and deferred publication/audit linkage checks. Added after exercising 012; 001–012 were not rewritten.

The original 24 demo listings/advertisers are retained. No seed rewrite, data rebuild, property claiming or automatic demo association occurs.

## Mapping contract

Publication is deliberately stricter than submission readiness. Missing mandatory public fields block publication with specific operator-visible messages. An operator cannot patch approved data through this UI. Existing terminal approval rules mean the advertiser must create a new draft and obtain review if an approved snapshot is incomplete; linked correction/reconsideration is a future workflow. No working-draft update changes a submitted or public record.

| Snapshot | Public mapping / rule |
| --- | --- |
| category | Existing `flatshares`, `rent`, `buy`; no new marketplace domain |
| city/locality/PIN | Trim/case-insensitive exact city/locality match plus identical PIN against exactly one existing `locations`/`cities` row; no fuzzy matching, geocoding, automatic canonical location creation or operator override |
| building/address/propertyType | Required from approved snapshot, verbatim escaped text; a new `properties` row, `is_demo=false`, no coordinates; address matching does not confer ownership |
| property identity | New property/unit per publication; never accept supplied property/unit IDs or attach to existing demo/real property. Deduplication across independently created drafts/properties is not inferred; operators must reject duplicate advertisements during review/publication |
| amenities | Allowlisted draft amenities resolved to normalized `amenities` and `property_amenities`; missing vocabulary rows created by exact allowlisted name |
| flatshare unit | `kind=room`, null BHK/carpet area; required furnishing and explicit existing occupants; label and public bedroom disclosure preserve private/shared arrangement; rules and household information preserved |
| rent/buy unit | `kind=entire-home`; BHK 1–10, positive carpet area and furnishing required. Studios remain unsupported |
| bathrooms | Rental `public_details.bathrooms`, rendered on detail page |
| sale age/project | `public_details.propertyAge` / `projectInfo`, rendered on detail page |
| monthlyRent/askingPrice | Positive whole INR, existing maximum ₹10 billion; category determines source |
| deposit | Required explicit nonnegative amount for flatshare/rent; null for sale |
| maintenance | Required explicit whole nonnegative monthly amount for flatshare/rent; above PostgreSQL integer maximum 2,147,483,647 blocks. Sale null / not disclosed, not fabricated zero |
| brokerage/terms | Explicit nonnegative amount required for every category; approved terms retained in allowlisted `public_details` and rendered |
| utilities/terms | Flatshare explicit optional amount and text retained/rendered, including zero; otherwise absence is disclosed as not supplied, never “billed at actuals” unless demo |
| availability | Required approved date for flatshare/rent (public schema is stricter than rental submission minimum); null for sale |
| title/description | Approved snapshot text; description minimum remains 40 characters/six words; React escaped rendering, no HTML/markdown/unsafe URL injection |
| advertiser | Existing immutable account-owned active non-demo advertiser ID; display name copied from submission to listing, not current editable profile; approved relationship is explicitly self-declared, never a badge |
| images | All processed approved photos, exact submitted order, explicit selected cover. Card picks cover without reordering gallery. Alt text is server generated; private keys are never public URLs |
| internal metadata | Account IDs, private profile descriptions/emails, policy/version fields, decision notes, storage keys, checksums and audit data excluded from public projection |
| server state | Listing `status=published`, `is_demo=false`, database publication time; submission remains historically Approved |

All supplied draft field types have explicit destinations above; no complete snapshot JSON is exposed on public routes. The publication preview displays the full intended approved public fields and submitted photo order/cover. Operator audit reasons are private. Category filters, sorting, pagination, homepage selection, cards/details and saved items continue using the existing listing repository. Advertiser filters use the approved relationship for real publications, not a subsequently changed profile kind. No homepage ranking changes were made.

## Publication protocol and retries

States are **preparing → published → unpublished**. Unpublished is terminal in this MVP. Unique submission and draft associations prevent repeated/concurrent publication of the same source and replacement through the same draft. An advertisement from a different draft is not automatically linked by address; duplicate-property detection/replacement is intentionally deferred, and operators must not approve a duplicate live advertisement as a replacement.

1. Authorize, lock source account → submission, recheck active source advertiser and intact approval event/current approval retention, validate approved mapping, reserve durable publication UUID and one media receipt per submitted photo. Reserve a one-hour cleanup lease. No public listing exists yet.
2. In a second transaction, lock source account → capability → submission → publication and source profile/advertiser. Holding compatible locks prevents private cleanup, advertiser suspension and competing publication from racing copies. Inspect only the immutable submitted image keys. Verify exact byte size, WebP dimensions/single frame and absence of EXIF/XMP/IPTC. Copy processed bytes, never originals, into deterministic `publications/PUBLICATION_UUID/PHOTO_UUID.webp` objects. Read back and SHA-256 verify every object. Existing identical copies are reused after an interrupted attempt; mismatches block for operator reconciliation.
3. Recheck authorization/expiry, create property, unit, listing, amenity relationships and image references. Update publication and append actor-attributed event in the **same database transaction**. Deferred guards require complete media receipts and audit linkage. Visibility begins only when this commits.

The submission ID itself is the durable idempotency identity; there is no arbitrary client public-resource ID or request-key remapping. Repeated publish of a live submission returns its same public ID without another event. Competing requests serialize. A lost success response is resolved by reopening the preview or retrying the same submission. A failed object operation/database transaction leaves a preparing reservation and deterministic media receipts, not visible/incomplete public records. Retrying resumes that reservation. Failure responses never claim success. Generic HTTP errors do not expose SQL, credentials or storage identifiers.

The deliberately simple MVP holds database locks during bounded photo I/O, one photo at a time (at most 12). This favors correctness over throughput and can delay same-advertiser private work/revocations. Remote storage slowness and connection occupancy need load/timeout acceptance; a leased background outbox worker is a future scalability improvement, not implemented here.

## Public media delivery and retention

Existing provider-neutral `PrivateStorage` supports both validated `drafts/…` and separate `publications/…` prefixes. It remains outside `public/` with private local permissions, or in the existing blocked-public-access S3 bucket. Buckets/directories never become public. S3 IAM must explicitly permit the reviewed publication prefix in addition to drafts; live-provider acceptance remains outstanding.

`GET /images/published/[publicationId]/[photoId]` fits the existing `/images/%` database constraint without weakening it. It serves only a media receipt belonging to a currently published publication **and** published non-demo listing; it rechecks visibility after storage read and verifies checksum/size. Bytes are WebP with nosniff and restrictive CSP. Public image responses are **no-store**, not immutable/CDN-cacheable. Public images explicitly bypass Next image optimization; optimizer patterns exclude `/images/published/**` so old optimizer copies cannot bypass revoked delivery. Private preview uses `/api/publications/[submissionId]/photos/[photoId]`, current capability authorization and private/no-store headers.

Publication copies are not draft cleanup targets and do not depend on the approved-unpublished 90-day original retention after successful publication. Active copies remain until unpublishing; snapshot originals still follow Phase 2.6's independent obligations. The minute-based reconciler and `npm run media:cleanup` also process bounded public batches. Expired **preparing** copies (after one-hour lease) and **unpublished** copies can be physically removed; durable receipts remain, with removal timestamps. Retry of a preparing publication clears removal markers and reconstructs copies from unexpired originals. Active published copies are never cleanup candidates. Storage failures remain retryable; monitor cleanup backlog and arrange external scheduling in nonpersistent runtimes.

Unpublishing immediately denies future media/detail/search reads after transaction commit, archives the existing listing, and retains submission/publication/audit metadata. No cache purge service is needed for this no-store origin policy, but a browser already displaying/downloaded bytes cannot be remotely erased. Deployment proxies/CDNs must respect no-store; no guarantee is made about an external client's saved copy. Restoring an independently lost *active* public object requires operator restore from backups; silently falling back to private originals is forbidden.

## Unpublishing, audit, dashboard and visibility

`POST /api/publications/[submissionId]` accepts only `{action:"publish"|"unpublish",reason}` with strict bounded validation. Verified session supplies actor, canonical Origin is required, request size is bounded to 4 KiB, JSON only, and database-backed operator write budget is 30/minute (shared review budget). No request accepts actor, advertiser, resource IDs, location overrides or content injection.

Unpublish requires explicit confirmation and meaningful reason, records operator/server time/previous and resulting state, and atomically archives listing + changes publication + appends event. Repeated unpublish is safe and creates no extra event. Publish/unpublish events are separate from advertiser and moderation events and append-only. No advertiser public-record write route is granted.

Operator area: `/dashboard/publishing` (25/page, approved submissions with statuses) and `/dashboard/publishing/[submissionId]` (exact snapshot preview, readiness blockers, photographs, confirmation controls and private publication audit). My Listings exposes operator navigation only to explicit grant holders, public Published/Unpublished labels and an Open public listing link. Deleted working drafts retain their separate submission/publication projection. Working drafts remain editable/private.

Search/detail/favorites reuse `listings.status='published'`. Saved references may remain internally but archived information is omitted and cannot reveal snapshots or review data. Next streamed not-found pages can have HTTP 200 despite no listing content; the application projection still returns null, and public media returns 404. Public pages and banners distinguish demo from real advertiser declarations; no new verification badges are shown. Existing fictional disclosures/galleries remain on demos.

## Manual end-to-end acceptance

Use synthetic data locally; privacy/legal acceptance is not complete for real customer information.

1. Apply forward migrations to development and isolated tests. Keep test media/database separate. Start the local app using the configured auth origin and Mailpit verification.
2. Register/verify advertiser, moderator, publisher and saver accounts. Grant moderator and publisher independently with their respective scripts; never give the advertiser publication permission as a workaround.
3. Pick an existing canonical city/locality/PIN (database `locations` joined to `cities`); there is no normalization edit UI. Create a complete draft with that location, building, address, property type, furnishing and category configuration/costs/availability. Upload two distinct photos; choose the second as cover and keep known order.
4. Submit. Moderator reviews exact private version and approves with reason. Confirm no public listing or publication is created merely by approval.
5. Edit working title/remove a working photo. The submitted version must remain unchanged.
6. Publisher opens `/dashboard/publishing`, selects the approved preview and examines intended public address/name/costs/photographs and blockers. Missing fields require new approved data, not arbitrary operator overrides. Enter reason, choose Publish approved snapshot, explicitly confirm.
7. Follow public link. Check category discovery/homepage ranking when applicable, INR costs, BHK/room arrangement, all gallery bytes/order and selected card cover, self-declared relationship, no fictional claim on this real-account advertisement, no verification claim or private data. Confirm demos still have fictional labels.
8. Saver bookmarks it and sees it in Saved Properties. Advertiser sees Published and Open public listing; editing the private draft does not change public content.
9. Publisher gives unpublish reason and confirms. Category/detail/saved listing data and public photo delivery must disappear. Audit and approved submission remain; repeated unpublish is safe, republish is rejected.
10. Revoke publisher capability and retry queue, preview, private photo and publish/unpublish requests: deny subsequent actions. Repeat unauthorized account, moderator-only and self-publication attempts.
11. Check keyboard, long text, no overflow at 375/768/1440px, and actual assistive technology/physical devices. Run cleanup after unpublishing and inspect metadata without logging keys/bytes/credentials.

## Production limitations and next milestone

This is not deployed. Privacy/legal approval, consent for public addresses/photos, privacy redaction/erasure/backups, actual storage quotas for retained/public bytes, least-privilege roles, cleanup failure alerting and external scheduling, restore drills, live S3/IAM validation, abuse/read throttling, photo-content acceptance, load/lock-timeout testing and physical-device/accessibility acceptance remain gates. Publication-linked source account deletion is explicitly blocked pending a privacy-aware unpublish/redaction workflow; neither deleting a private draft nor expiring originals erases public/audit text. CLI/audit protections are not tamperproof against database owners.

Approval validity for this MVP ends with the existing approved snapshot photograph-retention deadline (maximum provisional 90 days); published advertisements do not auto-expire at that point because public copies have independent retention. There is no ongoing authenticity/availability attestation, expiry notification or renewal process. Do not misrepresent this as legal verification or production acceptance.

Recommended next milestone: privacy-aware operational publication acceptance (consent, redaction/erasure, runtime privileges, backup/restore, storage quotas and monitored cleanup), then a separately scoped reviewed **replacement/renewal** workflow preserving a stable public identity and preventing two live advertisements. No replacement or unrestricted republish is implemented now.