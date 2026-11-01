# Phase 2.7 validation

## November 1, 2026 — separate-commit review

Phase 2.7 was extracted into an isolated snapshot against the Phase 2.6 commit, excluding the later Electric Minimal dashboard/Wishlist redesign. Shared public cards retain the pre-redesign saved-property control, and publishing pages use the pre-redesign account shell. Publication tests use that snapshot's saved-property wording. The Saved Properties disclosure was corrected to distinguish fictional demos from advertiser-supplied listings.

Isolated lint, 220 unit/API tests, 74 integration tests, production build and TypeScript checks passed. The full isolated production browser suite passed 37 tests with one existing intentional skip. The four-account production browser journey exercises advertiser submission, independent moderator approval without publication, separate publisher confirmation, housing-seeker save, unpublish, disappearance from category/saved discovery and 404 public photo delivery. These are automated browser checks, not a claim of human hands-on acceptance. Historical execution details below remain preserved.

The proposed commit excludes environment files, private media, browser artifacts, dashboard CSS/Wishlist components and `.DS_Store` files. A forbidden-path and common credential-signature scan found no matches; this is not a formal security audit. Publication replacement/renewal remains unimplemented and requires separate scoping. Manual acceptance, consent/privacy and production operational gates remain outstanding.

Local execution record, October 30, 2026. Not a production deployment or manual/legal acceptance claim.

## Executed checks

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript (`tsc --noEmit`) | Passed |
| Unit/API | 220 passed across 16 files |
| PostgreSQL integration | 74 passed |
| Production build | Passed, final sequential rerun |
| Production browser suite | 37 passed, one existing intentional skip; final full rerun |
| Electric Calm design-reference | 1 passed, after production browser suite |

Migration 012 followed by forward hardening 013 applied to development and isolated test databases. Migrations 001–011 unchanged. Baseline Git was `main` at `cf4eae2`, one local commit ahead of the locally known `origin/main`; no remote fetch/push, commit, reset, clean, rebase or deploy performed. Existing untracked `.DS_Store` files left alone.

## Coverage added

- Strict field mapping for flatshares/rent/buy, canonical location exactness/ambiguity/PIN mismatch, required physical configuration/address, missing explicit charges, maintenance overflow, public disclosure allowlist, invalid actions and injection.
- HTTP verified-session/origin/body/identifier/query boundaries, session actor attribution, safe failures and revoked authority responses.
- Separate moderator vs publisher authority and no self-publication; approval alone has no public record; incomplete/unapproved rejection; approved snapshot/name preserved despite working edits.
- All categories create normalized non-demo public records, retain image order/second-photo cover and disclose additional costs/property characteristics.
- Concurrent operators and repeated publication requests yield one stable listing and one successful publish event.
- Partial second-object failure, missing source restored/retried and database failure after copy leave no incomplete public listing, then recover same reservation.
- Revoked permissions block preview/private photo/mutation; unpublish concurrency/idempotency, saved visibility and media denial, append-only actor-attributed history and terminal republish rejection.
- Active publication copies excluded from cleanup; unpublished and expired preparing copies reclaimed; expired approval denied and same-reservation recovery exercised. Existing snapshot and demo search/media tests retained.
- Desktop/mobile browser journey: verified advertiser, two uploads, separate moderator approval without discovery, separately granted publisher preview/confirmation, current-draft isolation, public rent/search/details/ordered loaded photos/prices/name, another account save, operator unpublish, hidden search/saved/photo information.
- Operator preview overflow checks at **375, 768, 1440px**, plus existing responsive discovery/dashboard/editor checks.

Earlier failed iterations are not reported as passes: initial tests incorrectly uploaded duplicate bytes, used the wrong existing reorder contract, encountered a shared auth test-IP rate bucket, used ambiguous hidden-layout text selectors, navigated away before save completed, and expected 404 status from a streamed not-found page. Fixtures/selectors were corrected; production application semantics were not weakened to satisfy tests. One existing retention test's global removal counter was narrowed to its own referenced object so unrelated stale fixture cleanup cannot make it fail. Its retained-object assertion remains intact.

Synthetic publication fixtures intentionally retain terminal public/audit linkage and source accounts under immutable-history guards; no real development advertisements were fabricated or published. Test publication fixtures are archived. Tests do not disable immutable audit guards to erase history.

## Evidence / remaining acceptance

Logs: `/tmp/scout27-{lint,types,unit,integration,build,browser,design}.log`. Full architecture, mapping decisions, manual journey and production limitations: `phase-2.7-implementation.md`.

Not executed/proven by automated tests: real elapsed 90-day original expiry/cleanup across restarts; live S3 and IAM; process-kill at every instruction; physical mobile devices/screen readers; production load/latency; privacy/legal consent and redaction; deployment CDN behavior; backup/restore. Provider/database failure and deterministic recovery are exercised locally. Already downloaded bytes cannot be remotely withdrawn. Next streamed not-found HTML may return HTTP 200 but must contain no unpublished listing data; public image denial returns 404.
Final database inventory: **13 migrations, 24 demo listings, 24 demo advertisers, zero live publications** in both development and isolated test databases. Final lint/typecheck and whitespace checks passed. Generated `next-env.d.ts` type import restored to `.next/types/` after the design dev-server check.
