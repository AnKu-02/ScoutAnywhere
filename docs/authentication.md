# Phase 2.1 authentication and accounts

Phase 2.2 adds a verified-session-owned Saved Properties collection at `/dashboard/saved`; its data/visibility/CSRF and testing boundaries are documented in `saved-properties.md`. It replaces only the Saved Properties placeholder, not the unavailable listing/message workflows. The authentication mechanism itself is unchanged.

## Architecture

Better Auth owns password hashing, verification/reset tokens, persistent database sessions and auth cookies. Next.js Node route handlers delegate to its PostgreSQL (`pg` / Kysely) adapter; marketplace and preference queries remain parameterized Postgres.js. Better Auth is instantiated lazily: an absent secret or SMTP configuration disables account operations without breaking discovery or builds.

Registration accepts only name, email, password and the fixed verification callback. Passwords are 12–128 characters. Mailbox verification is required before login. Verification links expire in one hour; single-use password-reset links expire in 30 minutes. Reset revokes all sessions. Password changes require the current password and revoke other sessions. Email changes, uploads, OAuth, deletion and administrator UI are deliberately unavailable. Optional profile imagery is limited to bundled avatars, not actual photos or arbitrary external tracking URLs.

Sessions expire after seven days, refresh after one day and are checked against the database (no session-cookie cache). Cookies are HttpOnly, SameSite=Lax, host-scoped and Secure on HTTPS. HTTP is allowed only on loopback for development/tests. Auth tokens are not placed in localStorage. Reset pages use a no-referrer policy. Do not enable request/access-log query strings on auth/reset paths: emailed links necessarily carry tokens in URLs. Browser traces and Mailpit contain sensitive test material; use only synthetic accounts and do not publish artifacts.

`requireAccount` verifies sessions and email on both private pages. The profile API independently checks session and origin, strictly validates input, and derives the updated user ID exclusively from that session. Public profile data endpoints do not exist. The account control is presentation only. Only explicitly reviewed Better Auth endpoints are routed; its general update-user API is blocked.

## Data and permissions

Forward-only migrations 003 and 004 add Better Auth users, credentials, sessions, verification records, database rate limits, account preferences and account capabilities. Foreign keys cascade account-owned records on user removal. Existing properties, units, advertisers, listings, filters and seeds are unchanged.

Seeker/owner/broker interests may overlap and convey no authorization or verification. The separate capability table has no public mutation endpoint. Future privileged grants require an authorized, audited server/operator process; no administrative capability is assigned on signup. Phase 2.3 permits optional private advertiser profiles on new non-demo advertiser entities, never association with a fictional advertiser or demo listing. Creating a profile does not write `account_capabilities`, and the legacy `advertiser` capability does not authorize profile creation, listing management or publishing. Capability storage remains privileged groundwork, not an implemented administrator workflow. See `advertisers.md` for account/profile authorization and future property permissions.

## Local setup

From the repository root:

1. Install with `npm ci`. Copy `.env.example` to `.env` only if `.env` does not already exist; otherwise append the documented auth variables.
2. Generate `BETTER_AUTH_SECRET` using `openssl rand -base64 48`; put it only in ignored `.env`. Set `BETTER_AUTH_URL=http://localhost:3000` and use that exact browser origin (not 127.0.0.1).
3. Run `docker compose up -d --wait`, then `npm run db:migrate`. Existing demo seeding stays unchanged.
4. Configure local SMTP host `127.0.0.1`, port `1025`, secure `false`, and `MAIL_FROM=ScoutAnywhere <noreply@scout.local>`. No SMTP credentials are needed for Mailpit.
5. Run/restart `npm run dev`. Register at `/register`, open the local Mailpit viewer on localhost port 8025, follow verification email, then sign in. Mailpit captures mail locally; it does not deliver to actual mailboxes. Never use it for real user data.

No external account, SMTP service or credentials are provisioned. Production requires an independently configured SMTP provider, verified sender/domain, credentials via managed secrets, and TLS (implicit TLS with SMTP_SECURE=true or required STARTTLS on port 587). Never disable TLS certificate validation. Use a stable high-entropy auth secret and a canonical HTTPS BETTER_AUTH_URL.

## Abuse controls and deployment limitations

Better Auth database-backed rate limits apply in development and production: signups and reset/verification requests 5 per 10 minutes per endpoint; login 8 per minute; reset completion 5 per minute; general default 60 per minute. Without a trusted client IP header, Better Auth uses a restrictive shared per-path bucket. For deployment configure AUTH_TRUSTED_IP_HEADER only to a header overwritten by your ingress and block direct origin access. Never trust arbitrary forwarded headers. Multi-instance concurrency/load behaviour must be assessed; add edge-wide and per-recipient abuse controls/CAPTCHA before public signup at scale. Email and account enumeration mitigation is library-managed with generic reset/verification UI responses; timing and delivery side channels still require review.

The default database session store contains bearer session material: restrict table access, encrypt backups, require database TLS outside local Docker and isolate production data. Supply a least-privilege runtime role with marketplace SELECT and only required auth/preference access; capability grants must remain operator-only. Add operational monitoring without PII/token logging, retention/cleanup jobs (expired sessions, verification records, abandoned unverified accounts), recovery tests, MFA/passkeys, compromised-password screening and a reviewed account deletion/privacy process before real launch. No security audit or regulatory-compliance claim is made.

## Tests

Run lint, typecheck, unit tests, seeded isolated database integration tests and build as in README. Start local Mailpit before Playwright; its production server uses the isolated TEST_DATABASE_URL, synthetic account secret and loopback SMTP. Auth journeys create and clean up their own test users; do not run against production data. Email messages remain in local Mailpit until manually removed. Auth browser tests cover unverified rejection, verification email delivery, login, cookie attributes, reload persistence, profile changes, rejected identity/privilege fields, absence of granted capabilities, preservation of demo listings, reset revocation, reset-token reuse rejection and logout. A single abuse test also verifies invalid signup and repeated-login rejection; it runs only in the mobile project after the account journeys so it does not consume their shared login bucket. Existing marketplace journeys remain enabled. See `phase-2.1-validation.md` for results and a change inventory.