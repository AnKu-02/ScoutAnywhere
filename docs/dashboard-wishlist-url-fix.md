# Wishlist URL/history source fix — November 1, 2026

## Changes

- Wishlist derives category and page from Next.js search parameters instead of component-local state. Filter and pagination actions push URL history entries without scrolling; changing category resets page 1. Unrelated query parameters are preserved.
- Category validation delegates to the shared search-filter contract, with `all` as the collection-only default. The existing saved-page validator and 12-item page-size constant are reused.
- Missing/invalid values fall back to all/page 1. Pages beyond the available collection clamp to the last available page, including after removals; the incoming URL is not automatically rewritten.
- Navigation controls disable during route transitions. Authentication, session ownership, public-only projections, write endpoints and limits are unchanged.
- Added category-validation unit cases and an isolated desktop/mobile browser journey covering 13 saved demos, page-2 direct links, exact page membership, reload, pagination/filter URL changes, Back/Forward, detail-return restoration, invalid query values and shrinking collections.

## Validation status

**Automated validation completed November 1, 2026.**

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 232 passed, 16 files |
| `npm run test:integration` | 74 passed against existing isolated seeded database |
| `npm run build` | Passed |
| `npm run test:e2e` | Final full rerun: 39 passed, one existing intentional skip |
| Separate design-reference Playwright config | 1 passed, after production browser suite |

The initial browser run had four failures (desktop/mobile account greeting and pagination assertions), caused by text selectors matching hidden React-retained route content as well as visible content. Tests now use visible greeting/cards and the accessible pagination navigation. No application semantics or security assertions were weakened.

A subsequent rapid Wishlist-only rerun exhausted the fixed test-IP registration bucket before reaching pagination. Wishlist tests now use a per-test randomized synthetic IP, matching the existing account-test pattern, without disabling rate limits. The deliberate abuse assertions remain unchanged. A final full run validates this fixture hardening. A final production rebuild after the development design-reference check restores generated production route-type imports; viewport artifacts are retained separately under `/tmp/scout-dashboard-final-browser-artifacts` so other test configurations do not remove them.

The URL regression journey passed in both desktop and mobile projects: direct `?page=2` with exact listing membership, reload, previous/next URLs, category reset, Back/Forward, detail-return restoration, invalid values, last-page clamping and shrinking results. At 375/768/1440px it also checks dashboard and account navigation, active-route announcements, no horizontal overflow, keyboard Enter pagination and a visible focus outline. Dashboard and Wishlist screenshots are captured; representative mobile dashboard, tablet Wishlist and desktop dashboard screenshots were reviewed. Existing browser journeys passed advertiser setup/edits/isolation/suspension, profile/password reset/logout, all-category drafts/media/submissions/publications, Wishlist persistence, cross-tab changes and account isolation.

Local Docker Desktop and the existing Compose database/Mailpit containers were started; no volumes were removed. The isolated database was confirmed to contain 13 migrations and 24 demo listings before tests. No migrations or demo reseeding were needed. Node rejects `--env-file` in `NODE_OPTIONS`, so a Node `--env-file=.env` wrapper passes the loaded environment to the existing npm integration/browser scripts with an explicit separate-database guard. No environment secrets were printed.

Logs are `/tmp/scout-dashboard-{lint,unit,integration,build,browser-rerun,browser-final,final-build,design}.log`. Successful full browser runs replace the initial failed runs, not their historical evidence. Earlier Phase 2.7 results were not reused as redesign evidence.

Changed files were reread after editing. No database migrations, dependency additions, commits, pushes or deployments are part of this fix. All pre-existing Phase 2.7 changes remain local and preserved.

## Remaining acceptance

No failures remain in the final full automated run. Physical devices, actual screen readers, exhaustive network fault/pending-state journeys, live S3/IAM and production privacy/legal/operational gates are not proven by these checks. Browser viewport emulation and focus assertions are not a complete accessibility audit.