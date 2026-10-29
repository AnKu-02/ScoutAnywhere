# Phase 2.3 validation — October 29, 2026

## Delivered

Optional private advertiser profiles for existing verified Better Auth accounts, self-declared owner/broker/flatshare-tenant types, city/description editing, honest profile status/creation date, dashboard summary/navigation, account-isolated GET/PUT API, transactional rate limits and status auditing. Listing/property management and publishing explicitly remain denied. See `advertisers.md` for schema, authorization, future property relationships, operator controls and manual instructions.

## Database

Migration `006_advertiser_profiles.sql` applied successfully through the migration runner to local development and isolated seeded `scoutanywhere_test`. The existing advertisers entity is reused with unique non-demo account ownership; private profiles have a matching composite foreign key, immutable account relationship and generated timestamps. New status-event and per-account write-limit tables are indexed/bounded. No seeded advertiser was associated with an account.

SHA-256 comparison after implementation confirmed migrations 001–005, seed script, listing repository, search filters and geographic ports unchanged. Integration/browser fixtures cleaned up their synthetic accounts and non-demo advertisers; the isolated database retained all 24 fictional advertisers and listings.

## Executed results

| Check | Result |
|---|---|
| ESLint | Passed |
| Next route type generation | Passed |
| TypeScript | Passed |
| Unit / mocked HTTP-boundary tests | **97 passed** (59 existing + 38 new) |
| Isolated PostgreSQL integration | **31 passed** (22 existing + 9 new) |
| Optimized production build | Passed |
| Full production Chrome desktop/mobile browser suite | **27 passed**, one pre-existing intentional duplicate skip |
| Separate Electric Calm development reference | **1 passed** |
| Whitespace check | Passed |

New tests cover optional setup, owner/broker/tenant creation/editing, trim/length/type validation, malformed UTF-8/JSON and body limits, verified-session-derived identity, missing/foreign Origin, private/no-store responses, cross-account reads/forged writes, strict privileged-field rejection, concurrent setup uniqueness, foreign keys/demo separation, immutable relationships, capability/preference non-escalation, status auditing/suspension/bypass prevention, per-account throttling, cascading cleanup and favorite availability while suspended.

Browser journeys create synthetic accounts with real local Mailpit verification, sign in, create/update profiles, test all types, sign out/in for persistence, exercise two independent accounts, reject unauthorized access, check private response shape and suspension, and preserve favorites/discovery/auth journeys. New advertiser layouts test overflow, focus, touch target height and screenshots at 375px, 768px and 1440px on both desktop/mobile projects. This is browser emulation, not an exhaustive accessibility or multi-browser audit.

## Diagnostics and fixes

The new select labels initially included option text in implicit label lookup. Explicit label/ID associations corrected this without relaxing test expectations. The new browser form locators were scoped to visible form content to avoid React-retained hidden page trees; previous tests were not changed or skipped. The local development server was stopped before the clean production rebuild to avoid sharing `.next` output. Vitest gained the existing application's `@` alias so route modules can be tested with mocked session/repository boundaries. A TypeScript fixture-header inference issue was corrected in the test, not suppressed.

## Evidence

- `/tmp/scout-phase23-checks.log`: migration application and initial checks.
- `/tmp/scout-phase23-focused.log`: clean production build and diagnostic browser run.
- `/tmp/scout-phase23-final-browser.log`: complete final browser suite, exit 0.
- `/tmp/scout-phase23-final-checks.log`: final lint/typecheck, 97 unit/31 integration passes, preservation checks, exit 0.
- `/tmp/scout-phase23-design.log`: Electric Calm reference pass, exit 0.

No commit, push, reset, clean, checkout, rebase, deployment or secret-file edits were performed. HEAD remains `93dfa76`; intentionally uncommitted work is preserved. `.env` remains ignored with permission 0600. Local DB and Mailpit remain loopback-only infrastructure.

## Limitations / next milestone

Profile active status means editing enabled, not reviewed identity/ownership/brokerage or legal authorization. No publishing, claims, documents, moderation UI, admin bootstrap endpoint, organization management, messaging or integrations were added. Database-principal status audit is not tamper-resistant against an elevated database owner and does not replace human operator/change records. Runtime least privilege, ingress/abuse controls, retention/privacy and a security review remain production prerequisites. A future separately scoped property submission milestone must explicitly implement draft ownership, per-resource grants and review/publication policy; the proposed relationship model is documentation, not an enabled self-service permission mechanism.