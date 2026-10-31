# Phase 2.6 validation

Executed locally against the repository baseline `00976e9`, with forward-only migrations 010 and 011 applied to development and the distinct existing test database. No reset/reseed, commit, push or deployment was performed.

| Check | Actual result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| Unit/API Vitest | 204 passed, 14 files |
| PostgreSQL integration | 62 passed |
| Production build | Passed |
| Full production Playwright | 35 passed, one pre-existing intentional skip |
| Electric Calm development reference | 1 passed |
| Responsive browser assertions | 375px, 768px, 1440px; existing design suite and submission editor journey |

Evidence: `/tmp/scout26-unit.log`, `/tmp/scout26-integration.log`, `/tmp/scout26-build.log`, `/tmp/scout26-browser.log`, `/tmp/scout26-design.log`. Build → production browser → development design checks ran sequentially because they share `.next`.

New coverage includes all category minimums, explicit zero versus missing charges, one-photo minimum, meaningful descriptions, lifecycle matrix, strict reasons and request keys, verified-session/origin/body/privacy boundaries, actor impersonation denial, idempotent concurrent creation, stale text/media rejection, competing final decisions, audit/snapshot SQL mutation denial, draft changes and photo cleanup retention, cross-account isolation, moderator self-review denial/revocation, linked resubmission, withdrawal, and approval/public-discovery separation. Retention tests also cover shared obligations and expired photograph access with controlled application time. Existing cleanup tests remain in place for storage failures and recovery.

The new browser journey registers separate verified advertiser/moderator accounts, grants privileges through isolated test SQL, uploads private images, submits through the UI, edits/deletes working-draft content, reviews unchanged submitted data/images, requests changes, reads feedback, resubmits, approves without publication, withdraws another submission and denies self-review/revoked access. Test-only readiness fixtures are created through the draft API; the submission and decision interactions use the interface.

Initial failing runs exposed and fixed an omitted-boolean endpoint guard and browser synchronization/retained hidden-page selectors. Existing tests were not weakened.

Not claimed: physical-device keyboard, assistive technology, live S3, production load/security review, real elapsed 30/90-day physical cleanup or full privacy-erasure acceptance. See `phase-2.6-implementation.md` for operational/privacy launch gates.