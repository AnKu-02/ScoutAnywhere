# Phase 2.2 validation — October 29, 2026

## Scope

Session-owned bookmarks for existing published advertisements only. See `saved-properties.md` for the full schema, HTTP boundary, visibility policy, limitations and manual journey. No commits, push, reset, clean, deployment, external service changes or secret-file edits were performed. Existing uncommitted Phase 2.1 work remains in place.

Migration 005 was applied through the existing ledger/transactional migration runner to local development and the isolated seeded `scoutanywhere_test` database. Previous migrations were not edited. Demo seeds, geographic ports, search filters and existing listing search/detail query behavior were preserved (the listings repository adds only a published-ID projection helper).

## Executed checks

- ESLint: passed.
- Next route type generation and TypeScript: passed.
- Unit tests: 59 passed (18 new validation/redirect tests, existing 41 preserved).
- Database integration: **22 passed**, including concurrency, database constraints, ownership, all categories, current data, draft/archive visibility, idempotent removal, rate limits, bounded pagination and cascading deletion.
- Optimized production build: passed, including new API/dashboard routes.
- Production Chrome desktop/mobile Playwright: **25 passed, 1 existing intentional duplicate skip**, no failures in the final full run. Favorites journeys cover registration with Mailpit verification, anonymous intent, explicit save after sign-in, all categories, card/detail state, dashboard navigation/removal, logout/login persistence, invalid/forged requests, second-account isolation and cross-tab updates. Saved/dashboard and existing marketplace layouts checked at 375px, 768px and 1440px.
- Separate development Electric Calm reference: **1 passed**.

## Issues found and resolved

The existing card's stretched link intercepted bookmark clicks; the independent bookmark control now sits above its hit area. Existing responsive tests sometimes included React-retained hidden route trees and raced hydration; selectors now inspect visible images and artwork without removing any image-load, geometry, styling, keyboard or asset checks. Repeated suite runs consumed persistent auth rate-limit buckets; only the isolated test database's limiter rows were cleared before the final run. Test-only synthetic trusted-IP buckets keep the new journeys independent from the original deliberate login-abuse test. A stale isolated server was stopped before rerunning; the active development server was temporarily stopped for clean production builds.

## Logs

- `/tmp/scout-saved-checks.log`: migrations, initial lint/typegen/typecheck, 59 unit and 21 integration passes.
- `/tmp/scout-saved-clean-browser.log`: clean production build and intermediate diagnostic regression run.
- `/tmp/scout-saved-visible-browser.log`: final full production browser suite, 25 passes and existing skip; lint/typecheck passes.
- `/tmp/scout-saved-final-checks.log`: final non-browser validation, expanded integration results.
- `/tmp/scout-saved-design.log`: separate Electric Calm development reference run.

This is local validation, not public-launch readiness. No real availability, moderation, notifications or advertiser privileges were introduced; SMTP, ingress, database privileges, retention and operational hardening remain prerequisites for public registration.