# Private listing drafts — Phase 2.4

## Scope and access

Verified accounts with their own active, non-demo advertiser profile can create, read, edit, delete and privately preview flatshare, rental and sale drafts. `/dashboard/listings` is the entry point. This does not publish, submit for review, verify a property or grant rights over any existing listing. Relationship (`owner`, `broker`, `tenant`) is a separate self-declaration, not derived from profile type. No uploads, documents, contact collection, messaging or payments are added.

## Storage and authorization

Forward migration `007_listing_drafts.sql` adds a private staging table; migrations 001–006 and public property/unit/listing records are unchanged. Category-specific JSON has separate property, unit/room and advertisement sections. Composite foreign keys enforce account/advertiser pairing through `advertiser_profiles`; an update trigger prevents ownership, identity or category reassignment and supplies server timestamps/version increments. A database JSON validator checks envelope, allowed fields, types, bounds, dates and category compatibility independently of Zod.

Every repository query is owner-scoped. Writes lock the account and recheck/lock the own active non-demo advertiser inside the transaction, serializing same-account mutations against status changes. Suspended accounts cannot obtain preview data or change/delete drafts; ordinary discovery and saved properties remain available. Account deletion cascades drafts, receipts and budgets. Public listing authorization helpers remain deny-by-default; private drafts do not confer permission to manage public listings.

## API and concurrency

- `GET /api/listing-drafts`: own recent drafts, bounded to 100.
- `POST /api/listing-drafts`: strict `{requestId, content}`; account-scoped UUID creation key.
- `GET /api/listing-drafts/[uuid]`: own draft plus completeness checklist.
- `PUT /api/listing-drafts/[uuid]`: strict `{version, content}` full replacement.
- `DELETE /api/listing-drafts/[uuid]`: strict `{version}`.

All handlers require verified server sessions. Mutations require the configured canonical Origin and JSON, stream-bound requests at 24 KiB, reject unknown fields and accept no account/advertiser/public-property identifiers. Responses are private/no-store, vary by Cookie and noindex/nofollow. Private pages have noindex metadata, no-referrer and no-store headers. Errors never expose database details. Other-account and missing draft IDs are indistinguishable (API 404; pages render the same not-found screen, though an already-streamed App Router layout can carry HTTP 200). Stale edits/deletes and category changes return 409, preserving the editor's input.

Creation receipts store a canonical payload SHA-256 and draft reference, unique per account/key. Concurrent/retried identical creates return the same current draft; changed payloads conflict. Deletion retains a null receipt so delayed retries cannot resurrect it. Receipts are bounded to 1,000 creations per account (not reset by deletion); operator-reviewed retention is needed before large-scale use. Maximum 100 live drafts and 30 mutation attempts per minute per account. Expected mutation failures commit the budget rather than rolling it back; rate limits return 429/Retry-After. The editor retains an uncertain create payload/key in memory for retries, never localStorage. A browser reload does not preserve an uncertain-create key: review My Listings before starting another draft after an interrupted save.

## Validation and editor

`src/modules/listing-drafts/validation.ts` is the shared strict contract. Missing fields are permitted; supplied values must be valid. Blank fields are omitted; zero charges remain explicit. Whole rupee amounts are bounded to 10 billion; rent and sale prices must be positive. Dates are real calendar dates in 1900–2200. A saved category is immutable; switching category before initial save clears category-specific input.

- Flatshares: bedroom arrangement, occupants, furnishing, household/rules; monthly rent, deposit, maintenance, utilities/terms, brokerage/terms and availability.
- Rentals: BHK, bathrooms, carpet area and furnishing; monthly rent, deposit, maintenance, brokerage/terms and availability.
- Sales: BHK, carpet area, furnishing, optional age/project information; asking price and brokerage/terms. Rental charges are rejected.
- Shared property: city, locality, building, address, PIN, type and an allowlisted amenity set.

`draftReadiness` is reusable completeness guidance, not authorization or legal review. Category alone saves; required-next-step guidance appears beside missing fields and in a checklist. Address, city/locality/type, relationship, title/description, furnishing and applicable configuration/pricing/availability are needed for a complete checklist. Photographs remain deferred. Preview renders only saved data, explicitly says “Draft preview. Not published.” and has no contact, sharing, submission or publishing controls. Dirty-state feedback and browser unload/link confirmation help prevent accidental loss; browser-history navigation is not universally interceptable.

## Testing and local environment

Unit/HTTP tests cover strict category contracts, invalid pricing/dates, unknown fields, session/origin/body boundaries, private headers and safe errors. Isolated integration tests cover concurrent creation, stale writes, direct SQL constraints, ownership reassignment, suspension, rate limits, delete/retry receipts, cascading cleanup, all categories, public-search/favorite exclusion and preservation of 24 demo listings/advertisers. Desktop/mobile Playwright covers editor persistence, validation, preview, dirty-state, stale input, delete confirmation and two-account isolation.

Docker Desktop restart blocker is resolved locally: install used `brew install --cask --no-binaries docker` to avoid an existing broken `hub-tool` link, followed by a successful restart and `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --wait`. PostgreSQL and Mailpit recovered healthy without deleting volumes. Both local databases were migrated forward to 007; `.env` was not overwritten.

Run production builds, production browser tests and the development design-reference check sequentially: they share `.next`. See README for commands. This local implementation is not a claim of production readiness; dedicated runtime database privileges, retention policy, operational monitoring and deployment review remain required.