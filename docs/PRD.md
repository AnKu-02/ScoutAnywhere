# ScoutAnywhere — Phase 1 PRD

## Objective
Reliable, property-first housing discovery for India, initially Bengaluru and Mumbai. No roommate matching or people discovery. A demonstration marketplace foundation, not a live property service.

## Delivered scope
- Homepage with category navigation, city/locality search, room previews, cost-transparency explanation and listing entry point.
- Flatshares (individual rooms in existing homes), entire homes for rent, and residential sale listings.
- Persisted deterministic filters: category, city, locality, price bounds, furnishing, building type, advertiser, zero brokerage, applicable BHK and availability.
- Stable price/recent sorting, six-result pages, useful empty/invalid/error states.
- Details with explicitly fictional address, illustrations, costs, amenities, household/house rules and advertiser disclosure.
- PG Management information for operators, with a disabled non-submitting inquiry preview. Not a PG marketplace.
- PostGIS-ready relational schema, migrations, guarded repeatable seed, reusable components and automated tests.

## Acceptance example
Furnished flatshare in Bengaluru → HSR Layout → maximum ₹15,000 yields the seeded ₹14,000 demo room. SQL is authoritative, with no LLM, static fallback or matching algorithm.

## Trust and data conventions
All seed records are fictional and flagged `is_demo`. Every public page has a preview banner; detail and card disclosures repeat demo status. No contact information, ownership claims, ratings or verification badges. Local concept illustrations avoid suggesting photos are of available homes. INR formatting follows Indian grouping; sale display supports lakh/crore. City data comes from the database, not a fixed application allowlist.

## Explicit non-goals
Accounts, real submissions, inquiry delivery, messaging, payments, broker subscriptions, premium features, AI/LLMs, identity/property verification, reviews, thatJoint, India OSM integration, native mobile apps, spatial search and operational PG software.

## Phase 2 candidates
Agree identity, advertiser authorization and moderation models before accepting real listings; add safe authorized images, persistence for reviewed inquiries if desired, operational security/observability and deployment controls. Provider-neutral maps/geocoding and structured AI adapters can follow independently without replacing deterministic search.