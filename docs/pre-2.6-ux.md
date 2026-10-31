# Pre-2.6 UX stabilization

## Scope

Presentation and client-state refinements only. No migrations, JSON contract changes, ownership changes, new dependencies, submission, moderation or publishing. Existing authentication and private image processing/storage remain unchanged.

The editor is a single mounted form with four named, focusable sections: Property basics; Room/Home details (including title/description); Pricing and availability; Photos and review. All fields stay mounted and section links do not leave the editor. Existing category specifications and Zod/readiness functions are reused.

The top Save draft toolbar sticks only when practical. It returns to document flow whenever a text/select/textarea control is focused or the viewport is short, so it does not cover the focused input or sit above a software keyboard. No bottom overlay is used. Physical mobile keyboards still require hands-on acceptance; viewport emulation is not equivalent.

Text status distinguishes not-yet-saved, saving, saved, unsaved and error. Photo persistence is explicitly independent. Dirty comparison uses schema-normalized text, omitted undefined values and amenity-set ordering; reverting to the saved content clears dirty state. Invalid supplied values remain errors; missing values are completeness suggestions only. Linked summaries receive focus after validation failure and link to the actual input. Category changes with unsaved input require confirmation.

Existing stale-write checks remain unchanged. On a conflict local input stays mounted, saving pauses, and the user may open the saved preview in another tab, copy text, or explicitly confirm discard/reload. No automatic merge or force-write is introduced. Uncertain create retries retain the original request/payload as before; reload still loses that in-memory receipt, so review My Listings after an interrupted create.

Account navigation marks its current destination, including nested draft routes. Advertiser creation offers a direct private-draft link, not a new privilege. My Listings identifies the private collection and keeps cover/readiness/edit/preview/delete. User-facing versions are removed; expected versions remain in API requests. Timestamps are described as listing-detail saves, not photo activity. No fake submitted/published tabs are added.

## Deferred architecture issues

The draft collection still performs individual transactional media reads; batch read-only cover projections require a separate repository change. Browser-history navigation is not universally intercepted; unload/link warnings remain best-effort. No cross-session local draft copy or upload resumption is stored. Existing quota/receipt retention, cleanup monitoring, dedicated runtime DB privileges, real-device/assistive-technology acceptance and live S3 validation remain operational follow-ups.

See `phase-2.6-proposal.md` for the unimplemented submission architecture and required policy decisions. Do not treat this UX work as enabling moderation.

## Validation

Final results: ESLint and TypeScript passed; 155 unit/API tests passed; 53 isolated integration tests passed; production build passed; full production browser suite passed 33 tests with one existing intentional skip; development Electric Calm reference passed one test. Browser coverage includes four section focus/navigation and retained input, category-change cancellation, incomplete saves, linked invalid-field focus, dirty revert, in-flight/success/error feedback, conflict preview in another tab, cancellation and confirmed reload, current account navigation, advertiser-to-draft continuation, photo/security regression journeys, 320/375/768/1440px no-overflow and focused-input toolbar behavior at a 375x420 short viewport. A new advertiser continuation test initially reloaded before the return navigation completed; explicit destination/form assertions corrected the test race and the complete suite was rerun successfully. Production build → full production browsers → development design reference ran sequentially on the final application code. Development and test databases each retain 24 demo listings, 24 demo advertisers and nine applied migrations. No migrations or seed commands were run. Screenshots are generated in ignored test-results. Physical keyboard, assistive technology and live S3 acceptance were not performed. Tests use isolated accounts/database/media; no reseeding or migrations are required. Production build, production browser suite and development design checks must run sequentially because they share `.next`.