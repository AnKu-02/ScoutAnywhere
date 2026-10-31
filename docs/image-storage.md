# Private draft photography — Phase 2.5

## Scope

Only a verified session with its own active non-demo advertiser profile can upload, list, arrange, cover-select, delete or retrieve photographs for its own draft. Flatshares, rent and buy share the same media boundary. These are self-supplied photographs, not verified evidence. No publication, approval, identity/ownership verification, contact collection, messaging or payment workflow is added. Public demo images and property image constraints are unchanged.

## Local setup (no paid service)

1. Install locked dependencies with `npm ci` and start the existing PostgreSQL/Mailpit Compose services.
2. Run `npm run db:migrate` in development and apply the same migrations to the separate test database. Do not seed or migrate production implicitly.
3. Copy the **variable names/defaults**, not secrets, from `.env.example` into ignored `.env` as appropriate:

   ```dotenv
   MEDIA_STORAGE_DRIVER=local
   MEDIA_LOCAL_ROOT=.private-media/development
   TEST_MEDIA_LOCAL_ROOT=.private-media/test
   MEDIA_MAX_IMAGES=12
   MEDIA_MAX_ORIGINAL_BYTES=10485760
   MEDIA_MAX_PIXELS=40000000
   MEDIA_MAX_DIMENSION=12000
   MEDIA_ACCOUNT_BYTES=262144000
   MEDIA_ACCOUNT_IMAGES=240
   ```

4. Run `npm run dev`. Defaults work without altering existing `.env`. The local filesystem adapter stores objects outside `public/`, in Git-ignored `.private-media/development`; directories/files are created owner-only (0700/0600). This is private object-style local storage, not a public asset server. Test browsers explicitly select `.private-media/test`; integration tests use temporary directories and clean only their own fixtures. Never share test/development roots or buckets.

MinIO is not required and Compose is unchanged. The local adapter avoids an additional service and credentials while exercising the same key-based interface (`put`, `get`, `remove`) as S3. It is a single-host development solution, not distributed durable storage. Do not expose its directory through a web server, static export, shared mount or backup download endpoint. A configured root under this repository's `public/` is rejected. Operators must also prevent symlink-based redirection and restrict OS access to the storage root.

The adapter rejects symlinks at the configured root and within its object hierarchy. Its parent directory still needs trusted operator control. Do not change provider, bucket or root while metadata exists without an explicit migration/reconciliation procedure: metadata assumes the environment's configured store remains stable. Existing private data and `.env*` are excluded from Next output file tracing as well as Git.

## Optional S3-compatible provider

Use `MEDIA_STORAGE_DRIVER=s3`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` and optional `MEDIA_S3_ENDPOINT`. Never use `NEXT_PUBLIC_` variables or commit actual credentials. Remote endpoints require HTTPS; localhost HTTP is development-only. Use separate buckets and credentials for each environment, least-privilege Get/Put/Delete for the private draft prefix and the two privacy inspection operations.

The adapter fails closed unless `GetBucketPolicyStatus` reports non-public and `GetPublicAccessBlock` enables all four public-access protections. Providers lacking those APIs are not currently supported; “S3-compatible” does not mean every provider has identical policy semantics. No signed URLs, permanent object URLs, anonymous access, bucket creation or public-policy changes are performed by the app. The optional S3 adapter requires provider-specific deployment/integration validation; local validation uses the real filesystem adapter, not a paid cloud account. Use bucket-owner-enforced ownership/no public ACLs, deny public policies, TLS, encryption, lifecycle/retention monitoring and appropriate durable backups. Current privacy checks cache successful results per process: policies must remain operator-controlled and immutable during runtime.

## Upload and processing

The editor sends one raw image body per request, with a UUID `Idempotency-Key`; multiple selection is sequential, not one huge multipart body. No filename, MIME, dimensions, owner or storage path supplied by the browser grants authority. The server checks session, canonical Origin, UUIDs, own active advertiser/draft and per-account write budget before consuming bytes. Actual streamed bytes are bounded, including chunked uploads, with a receive timeout and two concurrent uploads per process.

Defaults/hard ceilings: 12 live photographs/draft, 10 MiB original, 12,000 pixels per side, 40 million decoded pixels; processed output is WebP, at most 2560 per side and 5 MiB. Configuration may lower count/input/decoded limits, never exceed those ceilings. Account defaults are 240 live/reserved photographs and 250 MiB processed/reserved bytes; each pending upload conservatively reserves 5 MiB. Maximum 40 photo mutation attempts/minute and 5,000 retained upload receipts/account. Deleted receipts cannot recreate an image; active/deleting objects count against quotas until cleanup. The UI documents defaults; operators lowering limits should update user-facing policy copy too.

JPEG, PNG and WebP signatures are inspected, then Sharp decodes with strict warning failure, input pixel/channel limits, single-page checks and dimension checks. Animated PNG/WebP markers are rejected as well. SVG, GIF, video, PDF, HEIC/HEIF and corrupted inputs are rejected. The UI explains exporting HEIC as JPEG. Orientation correction occurs before WebP re-encoding, which strips EXIF/GPS, XMP and embedded profiles. Only processed bytes reach usable private storage; originals are held transiently in bounded memory and never persisted.

Processing runs in a child process with no database/storage secrets in its environment, one libvips thread, disabled Sharp cache, bounded output, 128 MiB V8 heap, 12-second processing timeout and 16-second parent kill deadline. Two uploads/process bound aggregate work. These are defense-in-depth controls, not an OS sandbox: native libvips allocations are not covered by the V8 heap cap. Production must impose container/cgroup memory/CPU/PID limits, ingress/body/rate limits and monitoring, particularly across multiple app instances. Re-encoding does **not** guarantee malware-free content or authenticity. No antivirus scanner or image classification is claimed.

## Metadata, ordering and access

Migrations 008 and 009 add private metadata/reservations, account budgets, per-draft media versions and immutable ownership checks without changing earlier migrations or public image tables. Metadata stores opaque UUID, draft/account relation, request/hash receipt, opaque storage key, state, dimensions, processed size/type, order, cover and timestamps. Image binaries never enter PostgreSQL. Partial unique indexes enforce one cover and one position per draft; application transactions enforce exactly one cover whenever images exist and contiguous deterministic order. A draft-wide media version protects competing arrange/delete operations independently of the listing text version.

- `GET/POST/PUT /api/listing-drafts/[id]/photos`: list, raw upload, replace ordered IDs/cover.
- `DELETE /api/listing-drafts/[id]/photos/[photoId]`: version-checked deletion.
- `GET /api/listing-drafts/[id]/photos/[photoId]/content`: authorized WebP bytes.

All queries derive ownership from the verified session, never client authority. Writes serialize using the existing account → advertiser → draft lock order and recheck active status before finalization. Delivery rechecks authorization/readiness after storage I/O. Copying an image URL to another account or signing out does not grant access. Responses use private/no-store, Cookie variance, noindex/nofollow, nosniff, no-referrer, same-origin resource policy and restrictive content CSP. Browser image elements intentionally bypass `next/image`; optimizer local patterns allow only existing public images/avatars, not private API paths. No keys or storage URLs are returned to the browser. Cover appears on My Listings; preview preserves the stored order and marks the selected cover. Nothing enters public listing APIs, search results, favorites or sitemaps.

## Failure lifecycle and cleanup

1. Account/draft-locked reservation stores a generated key and input hash before processing; pending images are not deliverable.
2. Processing succeeds completely before a bounded object PUT under the same authorization/draft lock as finalization. Metadata becomes ready only after PUT; order/cover/version changes commit atomically.
3. Identical request retries return current ready media; pending retries ask the user to wait. Different payload/key reuse conflicts. Same input hash is also rejected within the draft to prevent repeated-photo accumulation. Failed/deleted receipts never resurrect images. The UI offers same-request retry after uncertain network responses, or an explicit new request after known failure.
4. Errors leave durable pending/deleting records. If the database commit response is ambiguous, cleanup never immediately deletes an object that may have become ready; it inspects committed state first. Failed object removal remains retryable.
5. Image deletion removes delivery access immediately, compacts order, picks a replacement cover, and enqueues storage removal. Draft/account foreign-key deletion leaves null-linked records so their keys remain reclaimable. Expired five-minute reservations and null-linked/explicitly deleting records are reclaimed.

`src/instrumentation.ts` runs a bounded 20-record cleanup batch every minute in a long-lived Node app. `npm run media:cleanup` handles up to 100 records independently; schedule it every minute with an external trusted job in production/serverless (in-process timers are not guaranteed there). Never expose cleanup as a public HTTP endpoint. Cleanup uses validated exact keys, rechecks persisted state with locks, and issues no bucket-wide listing/deletion. Null-owner deleted records are removed in bounded batches; owned tombstones are retained for idempotency with a 5,000 receipt ceiling. Storage outages can delay physical removal indefinitely: monitor the backlog and alert. If an operation fails after any object write, the durable reservation is the reconciliation source of truth.

The UI keeps upload files/request IDs only in memory, not localStorage. Closing the tab aborts client requests but the server may finish; reopen the draft before choosing a new upload. No resumable upload or cross-session retry token is implemented. Listing text save does not save photo changes: successful photos/cover/order mutations persist immediately and independently.

## Manual verification

On desktop and a real mobile browser, sign in with a verified account, create/choose an active advertiser profile, and repeat for flatshares/rent/buy:

1. Save an incomplete draft; choose two or more JPEG/PNG/WebP photographs. Try desktop drag-and-drop as well as the picker.
2. Observe per-file progress/success, check previews, choose a cover and move photographs using accessible buttons.
3. Preview the saved draft: correct order/cover, “Draft preview. Not published.”, no verification claim.
4. Sign out/in and reopen. Confirm persistence and My Listings cover.
5. Cancel a photo deletion, then confirm it; verify delivery fails for the deleted URL. Delete the whole draft and run bounded cleanup.
6. Copy an image URL to an anonymous browser and a second account: 401/404, never image bytes. Suspend the advertiser in operator-controlled test SQL and repeat.
7. Try HEIC, SVG, animated files, corrupt JPEG, oversized bytes/dimensions, duplicate input, 13 photos and stale requests. Verify clear errors and unchanged accepted images.
8. Interrupt a request and retry; review saved photos before choosing a new request. Run cleanup and check only fixture objects disappear.
9. At 375px, 768px and 1440px verify no horizontal overflow, focus visibility, keyboard reorder/cover/delete and touch controls.

Automated browser journeys are not a claim that these hands-on/real-device checks were performed.

## Future controlled publication (not implemented)

A future separately authorized review/publication transaction could select processed, ready private image IDs, create immutable approved-media records, and copy/version objects into a distinct public namespace with a deliberate retention/cache policy. It must not toggle this private bucket public or reuse private delivery URLs. Approval would not establish authenticity or property rights. No such transition exists in Phase 2.5.