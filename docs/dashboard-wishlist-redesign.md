# Electric Minimal dashboard and Wishlist

## Local implementation

- The opt-in `AccountShell` workspace provides a 1280px maximum container, 236px sidebar, flexible content, icon navigation and secondary sign-out. Authentication screens retain the compact shell.
- The sidebar becomes an inline, wrapping navigation at 850px; cards become single-column at 600px. Existing semantic color, typography and radius tokens are reused. No dependencies were added.
- Overview focuses on Wishlist and listing management, with an optional advertiser profile card, truthful self-declared status explanation, and a compact messaging-coming-soon note. Account email and creation date are in Profile & Security.
- All current dashboard shells, including protected operator and submission pages, use the workspace without changing their access checks.
- User-facing saved-property naming is Wishlist. The route remains `/dashboard/saved`; `/api/saved-listings`, persistence, internal names, ownership, origin checks, write limits and collection cap are unchanged. Saved Searches are not renamed.
- Wishlist reads the existing bounded saved ID collection (maximum 500) and existing current-published projection. It preserves saved order, filters all available collection data by the three existing categories, and renders 12 cards per page. The November 1 source fix derives page/category from the URL and uses router history entries for changes; `?page=2`, reload and Back/Forward restoration now have regression coverage added (not executed). Invalid parameters fall back safely, category changes reset page, and out-of-range pages clamp to available results. No new API is introduced.
- Existing property cards now have a circular heart control on the primary image. Details retain a descriptive Wishlist button. Confirmed saves fill the heart violet; pending actions lock against duplicates. State is changed only after success, so failed mutations keep the previous state. Existing authentication redirect and cross-tab refresh behavior are retained.
- Loading skeletons, whole-collection and category empty states, load failure/retry, pressed-state labels and reduced-motion treatment are included.
- Browser assertions were updated for intentional wording changes, and the existing persistence/isolation journey now asserts category filtering and active Wishlist navigation. Existing security assertions were not removed.

## Validation status

**Automated validation completed November 1, 2026.** Lint, TypeScript, 232 unit/API tests, 74 isolated integration tests, production build, 39 production browser tests (one existing intentional skip), and the separate design-reference test passed. Dashboard/Wishlist navigation, overflow and keyboard pagination were exercised at 375/768/1440px; representative screenshots were reviewed. See `dashboard-wishlist-url-fix.md`. This is not physical-device, screen-reader, legal/privacy or production acceptance.

The earlier terminal blocker is resolved. Production build, production browser tests and development design-reference checks ran sequentially because they share `.next`. Existing local Phase 2.7 changes remain uncommitted and preserved. Remaining hands-on acceptance includes physical devices, assistive technology and exhaustive network-failure/pending-state inspection.

No commits, pushes, deployments, migrations, schema changes, dependency additions or authorization workflow changes were performed for this redesign. The implementation remains local.