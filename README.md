# ScoutAnywhere

**Find your place, anywhere.**

An India-focused housing marketplace, starting with Bengaluru and Mumbai. ScoutAnywhere aims to make finding a flatshare, renting a home, or buying an apartment simpler and more transparent.

## What works today

- **Property discovery:** flatshares, rentals and sales, with filters, sorting, pagination, property details and itemized costs.
- **Accounts:** email verification, sign-in/out, password reset and private account settings.
- **Saved properties:** bookmarks that persist across sessions.
- **Advertiser profiles:** account-owned profiles with server-enforced permissions.
- **Private listing drafts:** incomplete saves, category-specific forms, readiness checklists and private previews.
- **Private photographs:** multiple uploads, progress/retry feedback, cover selection, reordering and deletion.

The interface uses the **Electric Calm** identity, with Space Grotesk and Plus Jakarta Sans fonts.

> Public discovery contains 24 fictional demo listings. Their illustrations are not property photographs or real availability. Account-owned drafts and uploaded photographs remain private. Nothing can be published or submitted for review yet.

## Run locally

You need Node.js 20.19+ (use a version supported by the locked dependencies), npm and Docker Compose.

```bash
npm ci
cp .env.example .env  # First setup only; do not overwrite an existing .env
chmod 600 .env
docker compose up -d --wait
```

Generate an authentication secret:

```bash
openssl rand -base64 48
```

Set that value as `BETTER_AUTH_SECRET` in `.env`. Keep `.env` private and use `http://localhost:3000` consistently for the app and `BETTER_AUTH_URL`.

Then initialize the development database and start the app:

```bash
npm run db:migrate
ALLOW_DEMO_SEED=true npm run db:seed
npm run dev
```

- **App:** http://localhost:3000
- **Local verification/reset email:** http://localhost:8025 (Mailpit; no real email delivery)
- **Design reference:** http://localhost:3000/design-lab (development only)

The seed creates fictional demo data and skips an already populated listings table. Never run demo seeding against production.

### Try private drafts and photos

Register, verify your email through Mailpit, and create an advertiser profile. Open **Dashboard → My Listings**, save a draft, then add photographs.

JPEG, PNG and WebP are supported, with defaults of 12 photographs per draft and 10 MiB per original. HEIC must be exported as JPEG first. Images are validated, re-encoded and stripped of metadata before private storage. Photo changes save independently of listing text.

Local uploads live in Git-ignored `.private-media/development`, outside `public/`. No paid storage service is required. An optional private S3-compatible adapter is included; see `docs/image-storage.md` for configuration, limits and deployment requirements.

```bash
npm run media:cleanup  # Reclaim a bounded batch of failed/deleted photo objects
```

Long-lived Node servers also run bounded cleanup every minute. Production/serverless environments need an external scheduled cleanup job and monitoring.

## Checks and tests

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Integration and browser tests require a **separate migrated and seeded test database**. Set `TEST_DATABASE_URL` in `.env`; never point tests at development or production data. For a fresh local test database using the default Compose configuration, run these setup commands once:

```bash
docker compose exec -T db createdb -U scout scoutanywhere_test
node --env-file=.env --import tsx --input-type=module -e 'if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error("Separate test database required"); process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; await import("./scripts/migrate.ts")'
node --env-file=.env --import tsx --input-type=module -e 'if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error("Separate test database required"); process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.ALLOW_DEMO_SEED = "true"; await import("./scripts/seed.ts")'
```

Skip `createdb` if the test database already exists. Reapply migrations after schema updates, then run:

```bash
node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration.test.ts
node --env-file=.env node_modules/@playwright/test/cli.js install chromium
npm run build
node --env-file=.env node_modules/@playwright/test/cli.js test
node --env-file=.env node_modules/@playwright/test/cli.js test --config=playwright.design.config.ts
```

Run the production build, production browser tests and development design-reference test **sequentially**: they share `.next`. Stop the development server before starting that sequence. Browser tests use port 3100 and separate private media storage.

Phase 2.5 validation: **151 unit/API tests**, **52 integration tests**, **31 desktop/mobile browser tests** (one existing intentional skip), and **one design-reference test** passed. Hands-on acceptance is still pending. Full results and limitations are in `docs/phase-2.5-validation.md`.

## Project structure

| Directory | Purpose |
| --- | --- |
| `src/app` | Next.js pages and API routes |
| `src/components` | Shared UI and dashboard controls |
| `src/modules` | Domain validation, authorization and repositories |
| `db/migrations` | Forward-only PostgreSQL migrations |
| `scripts` | Migrations, demo seeding and media cleanup |
| `tests` | Unit, integration and browser tests |
| `docs` | Architecture, setup and milestone reports |

**Stack:** Next.js App Router, React, TypeScript, PostgreSQL/PostGIS, Better Auth, Zod, Sharp, Tailwind CSS, Vitest and Playwright.

## Documentation

- `docs/architecture.md` — system design and data boundaries
- `docs/authentication.md` — accounts, email and test setup
- `docs/saved-properties.md` — saved-listing behavior
- `docs/advertisers.md` — advertiser profiles and permissions
- `docs/listing-drafts.md` — draft validation and lifecycle
- `docs/image-storage.md` — private media setup, security and manual testing
- `docs/phase-2.5-validation.md` — executed checks and remaining acceptance
- `docs/visual-identity.md` — Electric Calm design system
- `docs/PRD.md` — product direction
- `AGENTS.md` — engineering guidance

## Boundaries and future direction

Publishing, moderation, identity/property verification, messaging, reviews, maps/geocoding, payments, AI and native apps are **not implemented**. PG Management is informational only. Active advertiser status and uploaded photographs do not establish authenticity, ownership or permission to advertise.

The longer-term vision includes trusted property discovery, advertiser verification, location-based search, messaging, reviews and locality insights. Each needs a separately scoped implementation.

This is not a production deployment. Before launch, complete manual acceptance, security/privacy review, durable storage setup, resource limits, monitoring, backups and recovery testing. The optional S3 adapter still needs live-provider validation. See the architecture and media documentation for details.
