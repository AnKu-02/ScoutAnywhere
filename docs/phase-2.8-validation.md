# Phase 2.8 validation

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 251 passed across 18 files |
| `node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration.test.ts` | 78 passed against separate migrated/seeded PostgreSQL test database |
| `npm run build` | Passed; messaging page/API routes included |
| Full production Playwright suite | 39 passed / 1 existing intentional skip |
| Extended publication/messaging journey rerun after additional mobile back/focus assertions | 2 passed (desktop/mobile) |
| Development Electric Calm design-reference test | 1 passed; rerun after final production build/journey |
| `git diff --check` | Passed |

Build, production browser suites and development design-reference runs were sequential because they share `.next`. Development server was stopped for the build/browser sequence. Migration 014 was applied to development and isolated test databases through the existing migration runner; no previous migration was edited. No application data was reset or seeded over. Test fixtures use the existing isolated test environment and synthetic accounts. A first integration run caught cleanup fixture ordering and a unit test caught unsafe bigint parsing; both were fixed and the full affected suites rerun successfully.

## Coverage added

- Unit/API: strict bounded text, recipient/sender injection, idempotency contract, safe bigint cursors, server-clock 48-hour threshold, reply/dismissal exchange behavior, unavailable context, validated return destinations, verified sessions, origin/body/content-type checks, private responses, pagination/query rejection, session-scoped state changes and error privacy.
- PostgreSQL: duplicate/concurrent inquiry and message retries, one conversation constraint, forged sender SQL rejection, cross-account reads/sends/state denial, self/demo/unpublished inquiry prevention, history persistence with null restricted context, real property context, independent unread watermarks, first-unanswered dismissal/new exchange, suspension and idempotent receipts, minute/day limits and 56-message pagination without gaps.
- Existing publication browser journey extended, without weakening existing assertions: separately approved/published real account-owned listing, no empty conversation, inquiry, literal HTML text safety, context/cover/locality/price, Continue conversation, waiting, controlled database timestamp aging, reminder/dismissal persistence, advertiser reply, unread filter/clear, third-account isolation and authorized unpublication with history/photo/context protection.
- Viewports: 375, 768 and 1440px overflow assertions/screenshots; mobile list/back flow; composer keyboard focus. Screenshots visually inspected.

Artifacts: `/tmp/scout-messaging-artifacts/messages-{desktop,mobile}-{375,768,1440}.png`.
Logs: `/tmp/scout-messaging-{unit,integration,build,browser,full-browser,design}.log`.

## Not claimed

Human four-account acceptance, physical devices, actual screen readers, exhaustive network interruption behavior, production deployment, live service hardening, abuse/report/block flows, retention/deletion/export/legal requirements and legal/privacy compliance are not validated. Messages are not end-to-end encrypted. No Git commit, push, reset, rebase, clean or deployment was performed. Next build/dev regenerated `next-env.d.ts` automatically; its initial dev-path difference was not manually reverted. Existing `.DS_Store` metadata remains untouched.

See `phase-2.8-messaging.md` for manual instructions, authorization decisions and production prerequisites.