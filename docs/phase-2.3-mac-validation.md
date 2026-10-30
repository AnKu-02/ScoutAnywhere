# Phase 2.3 — Mac local environment validation

## Outcome

**Application checks passed after test-only corrections.** The final desktop/mobile Playwright suite returned exit code 0: **27 passed, 1 existing intentional skip**. The separate development design-reference test also passed. Lint, TypeScript, 97 unit tests, 31 integration tests and the production build passed. Docker installation maintenance remains unresolved; see below. The initial browser run returned **16 passed, 11 failed, 1 skipped** and is retained below as diagnostic history, not the current result.

No application features were added or redesigned. Validation itself did not involve committing, pushing, deployment, destructive Git operations or database-volume deletion. Committing and pushing the reviewed test/documentation changes was authorized separately afterward.

## Environment

- Apple Silicon (`arm64`), macOS 15.6.1.
- Node.js v25.5.0 and npm 11.8.0, installed through Homebrew after approval. This records the tested version, not a production runtime recommendation.
- Docker client/server 29.2.0; Compose v5.0.2.
- Node/npm/Docker were initially unavailable in both the agent shell and a fresh login shell. Standard installation and version-manager locations were inspected before installation.
- Docker Desktop's engine eventually started after reopening and completing local setup. A background Homebrew process was observed suspended at a privileged Compose-linking step; working CLI/Compose and engine checks do not prove that installer process finished.
- Docker Desktop displayed an unsupported-version warning. Updating it remains a separate maintenance task.
- `npm ci` used the existing lockfile, installed 446 packages and reported zero vulnerabilities at installation time. This is not a security audit. It also emitted an ESLint deprecation warning.

## Local configuration and data isolation

An ignored `.env` was created only because none existed, with a generated local auth secret and mode `0600`. Secret values were not printed. Database URLs target loopback port 5434; account origin is localhost port 3000. Mailpit captures local mail on SMTP port 1025 and exposes its viewer on port 8025. Both services bind to loopback.

The initial native image pull failed because the pinned PostGIS image lacked a matching ARM64 manifest. The following command succeeded without changing the Compose configuration:

```sh
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --wait
```

All six migrations were applied independently to local `scoutanywhere` and `scoutanywhere_test`. Each was seeded using the existing opt-in script. After the browser run, both retained six migration records and 24 fictional demo listings. No production database was used. The database volume and local Mailpit messages were preserved.

## Commands executed

Commands below were run from the repository root unless they are system installation commands. Existing databases must not be recreated blindly. The URLs shown are the repository's documented local-only credentials, not production credentials.

```sh
# Approved prerequisite installations; Docker setup also required local UI interaction.
HOMEBREW_NO_AUTO_UPDATE=1 brew install node
HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask docker

npm ci
docker version
docker compose version
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --wait
docker compose ps
npm run db:migrate
ALLOW_DEMO_SEED=true npm run db:seed

# Created only after checking the local test database did not already exist.
docker compose exec -T db createdb -U scout scoutanywhere_test
DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test npm run db:migrate
DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test ALLOW_DEMO_SEED=true npm run db:seed

npm run lint
npm run build
npm run typecheck
npm test
TEST_DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test npm run test:integration
npx playwright install chromium
TEST_DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test npm run test:e2e
git diff --check
```

The production build ran before the standalone typecheck so generated route types were available. Build tooling regenerates `next-env.d.ts` for the active build mode. The final production build changed its imports from `.next/dev/types/` to `.next/types/`; these generated production references are included in the reviewed changes.

## Actual results

| Check | Mac result |
|---|---|
| ESLint | Passed |
| Standalone TypeScript | Passed |
| Unit / mocked API boundary tests | 97 passed |
| Isolated PostgreSQL integration | 31 passed |
| Production build | Passed |
| Desktop/mobile Chromium suite | Final: 27 passed, 1 existing intentional skip; exit 0 |
| Separate development design-reference test | 1 passed; exit 0 |

Initial browser failures affected both account journeys, desktop advertiser setup, both discovery journeys and six responsive visual-identity cases. Reported failures included strict-mode locator errors caused by multiple matching elements. The follow-up diagnosis below resolved these without weakening assertions or changing application permissions.

In the initial run, the mobile advertiser journey passed and the desktop advertiser journey reached its final Saved Properties assertion before a duplicate-match failure. In the final full run, both desktop/mobile advertiser, account, discovery, favorites and responsive-layout journeys passed.

## Follow-up diagnosis and corrections

- Scoped account fields to the visible account form, following the existing advertiser test convention. Used accessible roles/regions for the empty saved heading, search result count, homepage city and property-filter disclosure. Scoped the datalist-backed locality input by its label and visibility. Assertions remain strict; no tests, ownership checks or expected rejection statuses were removed.
- Repeated runs consumed the account journey's persisted signup rate-limit bucket. Each account test now receives a synthetic isolated test IP through the existing isolated server's trusted-header mechanism. The abuse test still shares a bucket within its requests and verifies throttling. Production auth configuration and rate limits are unchanged.
- One intermediate run incorrectly overlapped a production rebuild with the browser server and produced manifest errors. It is not treated as a valid application result. Build, production browser and development preview runs must execute sequentially because they share `.next` output.
- The successful production browser run is recorded in `/tmp/scout-e2e-verified.log`; the development-reference result is in `/tmp/scout-design-mac.log`. The existing duplicate abuse-test skip remains unchanged.
- The earlier Homebrew installation subsequently rolled back Docker's app files after its privileged linking step failed with `sudo: a password is required`. The Docker CLI symlink became dangling, although the existing backend continued serving PostgreSQL and Mailpit and all database/browser checks completed. Do not stop that backend expecting it to restart until Docker Desktop installation is repaired through an approved local administrator workflow. No reinstall or volume deletion was attempted during the test corrections.

Additional command executed for the separate reference test:

```sh
TEST_DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test npx playwright test --config=playwright.design.config.ts
```

## Evidence and remaining work

Local transient logs were written to `/tmp/scout-npm-ci.log`, `/tmp/scout-lint.log`, `/tmp/scout-unit.log`, `/tmp/scout-integration.log`, `/tmp/scout-build.log` and `/tmp/scout-e2e.log`. Playwright wrote failure context and traces under ignored `test-results/`. These files are local diagnostics, not committed evidence, and may disappear. Review traces for private test data before sharing them.

Application/browser corrections and reruns are complete. Remaining environment maintenance: repair the rolled-back Docker Desktop installation and use a supported version through an approved local installation step, preserving the database volume. Application test success does not establish that the Mac can restart Docker successfully in its current installation state.

This setup is for local development, not production deployment. Share Compose, environment examples and instructions; never publish `.env`, database volumes or captured Mailpit messages.