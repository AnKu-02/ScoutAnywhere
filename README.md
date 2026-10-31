# ScoutAnywhere

**Find your place, anywhere.**

ScoutAnywhere is a housing marketplace designed to make finding, renting, and buying properties in India simpler, more transparent, and more reliable.

Inspired by platforms like ImmoScout24 and WG-Gesucht, ScoutAnywhere aims to bring property discovery and communication into one seamless experience.

## What We're Building

- **Flatshares:** Discover available rooms in shared apartments.
- **Apartments for Rent:** Explore rental properties listed by owners and brokers.
- **Apartments for Sale:** Browse residential properties available for purchase.
- **PG Management:** Connect PG operators with suitable property management solutions.

## Long-term vision (not implemented in Phase 1)

- Property and advertiser verification
- Location-based search and interactive maps
- Transparent pricing and brokerage information
- Secure in-app messaging
- Property and advertiser reviews
- Locality insights and neighborhood discovery

## Phase 1 implementation

Working discovery preview: responsive homepage, flatshares/rent/buy pages, validated URL filters, deterministic sorting and pagination, property details, itemized costs, and informational PG Management and listing-entry pages. All 24 seeded properties and advertisers are fictional, explicitly marked demo data. Locally bundled concept illustrations are **not photographs**. There is no real availability, identity/property verification, submission, inquiry delivery, messaging, AI, map, or payment service. Phase 2.1 adds real account authentication when configured, separate from fictional marketplace data.

### Phase 2.1 — Accounts

Better Auth provides email/password registration, required mailbox verification, sign-in/out, persistent database sessions, password reset and password changes. Protected `/dashboard` and `/account` pages provide private profile/preferences, creation date and optional bundled avatar selection. My listings and messages remain explicitly unavailable placeholders. Interests can overlap and grant no privileges; registering cannot claim demo listings. Real photo uploads and email changes are not implemented.

**Setup:** generate `BETTER_AUTH_SECRET` with `openssl rand -base64 48`, add the auth/SMTP variables from `.env.example` to ignored `.env`, run `docker compose up -d --wait` and `npm run db:migrate`, then restart the dev server. Use localhost port 3000 consistently. Local Mailpit captures verification/reset mail at localhost port 8025; it never delivers to real mailboxes. Missing configuration disables account forms rather than simulating success. See `docs/authentication.md` for complete setup, architecture, permissions, test requirements and production security limitations. No external provider or credentials are assumed.

### Phase 2.2 — Saved Properties

Verified accounts can bookmark specific advertisements from flatshare/rental/sale cards and detail pages, then view or remove them at `/dashboard/saved`. Saved state persists across sessions and synchronizes between cards/details and active tabs. Anonymous bookmark attempts lead to sign-in with an allowlisted listing return path; returning does not automatically save anything. The database stores only user/listing relationships and timestamps, with uniqueness, cascading deletion, account-isolated queries and bounded writes. Only currently published listings are disclosed; drafts/archives are hidden and deleted listings disappear. Current fixtures remain explicitly fictional, not real availability. Run `npm run db:migrate` after updating. See `docs/saved-properties.md` for security, visibility policy, limits and local testing.

Local Phase 2.2 validation: lint/typecheck/build passed, 59 unit tests, 22 isolated-database integration tests, 25 production browser tests (one existing intentional duplicate skip), and the Electric Calm reference test passed. Full results and diagnostic notes: `docs/phase-2.2-validation.md`.

### Phase 2.3 — Advertiser foundation

Existing verified accounts can optionally create and edit a private advertiser profile from **Dashboard → Advertiser** (`/dashboard/advertiser`). Supported self-declared types are Property Owner, Broker / Real Estate Agent, and Existing Flatshare Tenant. Setup collects a display name, Bengaluru/Mumbai operating city and optional short description; account email is not published. Browsing and favorites do not require advertiser setup. An active profile enables editing only: it does **not** verify identity, ownership, tenancy, brokerage credentials or permission to manage a listing. Property submissions remain unavailable.

Migration `006_advertiser_profiles.sql` reuses the existing advertiser entity with a unique account relationship and database-enforced separation from fictional advertisers. A private profile extension stores city/description/status/timestamps; status events are audited and writes are account-rate-limited. No account capabilities or property/listing rights are granted. Run `npm run db:migrate`. See `docs/advertisers.md` for ownership, deny-by-default authorization helpers, future verification design, database lifecycle and manual testing; see `docs/phase-2.3-validation.md` for executed checks.

Local Phase 2.3 validation: lint/typecheck/build passed, **97 unit tests**, **31 isolated-database integration tests**, **27 production browser tests** (one existing intentional duplicate skip), and the Electric Calm reference test passed. Advertiser desktop/mobile layouts were checked at 375px, 768px and 1440px.

### Phase 2.4 — Private listing drafts

Verified accounts with their own active advertiser profile can create, save incomplete, edit, delete and privately preview flatshare, rental and sale drafts at `/dashboard/listings`. Category-specific property/room/home/advertisement sections and self-declared relationships remain isolated from public marketplace data. Ownership constraints, optimistic versions, creation retry receipts, bounded requests and account write limits protect storage. Nothing is published, submitted for review or verified; photographs/uploads remain deferred. Run `npm run db:migrate` for forward migration 007, including your separate test database. See `docs/listing-drafts.md` for validation, access, concurrency, limits and local environment notes. Historical phase descriptions above do not override this scope.

The local Docker Desktop restart blocker is resolved; PostgreSQL and Mailpit restarted healthy with existing volumes and demo records preserved. Continue using the Apple Silicon emulation command below when needed.

Phase 2.4 local validation: lint, TypeScript and production build passed; **128 unit/API tests**, **40 integration tests**, **29 desktop/mobile browser tests** (one existing intentional skip), and **1 design-reference test** passed. Both databases retain all 24 demo listings and advertisers. See `docs/phase-2.4-validation.md` for results and limitations.

### Stack

Next.js App Router, React, TypeScript, Tailwind CSS, Lucide, Zod, PostgreSQL 17 + PostGIS, Postgres.js, Vitest and Playwright. Exact installed versions are recorded in `package-lock.json`. Modular monolith; no AI or geocoding dependencies.

### Local development

Requires Node.js 20.19+ and Docker with Compose (or a PostgreSQL instance with PostGIS). From the repository root:

```sh
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
ALLOW_DEMO_SEED=true npm run db:seed
npm run dev
```

Copy `.env.example` only when `.env` does not already exist; preserve existing configuration. For account verification and password-reset testing, generate a local `BETTER_AUTH_SECRET` as described in `docs/authentication.md`. Never commit `.env`.

**Apple Silicon Macs:** the pinned `postgis/postgis:17-3.5` image did not provide an ARM64 manifest during local validation. Start the documented services using Intel emulation instead:

```sh
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --wait
docker compose ps
```

This command-scoped setting does not change the Compose file. Docker Desktop must be running with emulation available. Both services should report healthy. PostgreSQL uses localhost port 5434; the Mailpit email viewer is at localhost port 8025. These containers provide supporting services only; start the Next.js application separately with `npm run dev`. See `docs/phase-2.3-mac-validation.md` for actual Mac validation results and local tooling limitations.

Open localhost on port 3000. Docker binds the database to loopback port 5434. Credentials in Compose are local-development-only; never reuse them for production. `.env` is ignored; no environment secrets are sent to the browser. Use a separate non-production database for demonstration data. The migration user needs permission to install PostGIS; deployed runtime credentials need marketplace read access and narrowly scoped auth/preference writes, not migration or capability-grant privileges.

Migrations run transactionally with an advisory lock and a migration ledger. Seed is transactional, refuses production mode, requires explicit opt-in, and skips if listings already exist; it never truncates existing data. `docker compose down` stops the database without deleting its volume. Do not delete volumes unless you intend to lose local data.

### Testing

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Database and browser tests require a **separate seeded test database**:

```sh
docker compose exec -T db createdb -U scout scoutanywhere_test
DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test npm run db:migrate
DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test ALLOW_DEMO_SEED=true npm run db:seed
export TEST_DATABASE_URL=postgres://scout:scout_local_only@localhost:5434/scoutanywhere_test
npm run test:integration
npx playwright install chromium
npm run build
docker compose up -d mailpit
npm run test:e2e
```

Create the test database only once. Browser tests start an isolated production server on port 3100 and cover desktop and mobile Chromium. If Google Chrome is already installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. Test runners do not automatically load `.env`; export `TEST_DATABASE_URL`. Integration tests validate database constraints and perform a deliberately invalid update expected to be rejected; never point tests at real data.

### Search contract

Example: `/flatshares?city=Bengaluru&locality=HSR+Layout&maxPrice=15000&furnishing=furnished`.

City and locality use case-insensitive exact matching (trimmed), not fuzzy/geocoded search. Prices are integer INR; sale filters use the full rupee amount, while cards show lakh/crore. Sorting is `recent`, `price-asc`, or `price-desc`, with stable ID tie-breaks; pages contain six items. Room listings ignore BHK; sales ignore availability dates. `availableBy` means a listing is available **on or before** the chosen date. Flatshare property type refers to the containing building. Household size excludes the incoming resident. Maintenance is monthly, brokerage one-time, utilities extra. Coordinates are illustrative and not shown as real locations.

### Project layout

- `src/app`: server-rendered routes, loading/error/not-found states, semantic style tokens.
- `src/components`: reusable navigation, search, cards, gallery and detail sections.
- `src/modules/search`: shared Zod filter boundary, ready for future structured-search adapters.
- `src/modules/listings`: parameterized database search and detail retrieval.
- `src/modules/geography`: provider-neutral future geocoder contract only.
- `db/migrations`, `scripts`: schema and explicit demo seeding.
- `tests`: unit, real-database integration and browser journeys.
- `docs/PRD.md`, `docs/architecture.md`, `AGENTS.md`: scope and engineering guidance.

### Phase 1.5 — Visual identity and UX

Electric Calm is the selected working identity and only active theme, with locally hosted Space Grotesk headings and Plus Jakarta Sans UI. Homepage search uses one Flatshares/Rent/Buy mode selector; homepage cards are concise while result cards and details expose deposits and charges; filters can collapse; layouts and typography have been refined. Demo disclosures and backend behavior are preserved.

Run `npm run dev` and open `/design-lab` for the Electric Calm component reference. Alternative theme styles and loaders have been removed. This route returns HTTP 404 in production. Fonts are bundled locally with licenses; no external font service is needed. Design rationale, tokens, font licensing, limitations and the separate development-browser test command are documented in `docs/visual-identity.md`.

Phase 1.5 validation: lint/typecheck/build passed, 21 unit tests, 15 real-database tests, 18 production browser tests and one development-preview test passed. Responsive checks include 375px, 768px and 1440px.

### Limitations and next steps

No production deployment or external services are configured. PG inquiry inputs remain disabled; account forms collect minimal private account data only when configured. Electric Calm is the current identity. Supplied artwork stands in for future authorized listing photographs. Search uses bounded offset pagination and locality equality; spatial search is deferred. Before real launch: security review, advertiser ownership controls, moderation and verification workflows, upload safeguards, operational monitoring, deployment secrets/TLS, least-privilege database credentials, backups/recovery, privacy/legal review, data retention/deletion and performance/load testing. AI, messaging, maps, payments, subscriptions and native apps remain separate milestones.

---

*Making housing discovery simpler, one city at a time.*
