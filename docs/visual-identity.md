# Phase 1.5 — Electric Calm finalized

## Working identity

Electric Calm is the only active theme: canvas #F7F7F2, ink #17251F, violet #6747FF, lime #C7F75D and stone #DDE2DF. Space Grotesk supplies branding/headings; Plus Jakarta Sans supplies UI/body text. Semantic CSS roles remain configurable. Violet identifies primary actions, links and current navigation; restrained lime tags indicate zero brokerage, never verification.

Alternative theme styles and their font-loading module were removed. Previously supplied alternate font binaries and licenses remain archived locally but are not referenced or loaded. No theme switcher is exposed. `/design-lab` is now a small Electric Calm component reference only, blocked with HTTP 404 outside development by the existing narrowly matched proxy and page guard.

## Artwork inventory and use

All paths below are under `public/images/`. No source artwork was generated, downloaded, overwritten or deleted during finalization.

| Final filename | Original supplied filename | Dimensions | Usage |
|---|---|---|---|
| `violet-topographic-map.png` | Minimalist Violet Topographic Map.png | 1672 × 941 | Current decorative hero artwork |
| `lavender-doorway.png` | Previously renamed Sunlit Lavender Doorway with Olive Plant.png | 1672 × 941 | Owner/advertiser CTA panel |
| `lavender-bedroom-workspace.png` | Sunlit Lavender Bedroom Workspace.png | 1536 × 1024 | Stable demo listing image variation |
| `lavender-doorway-olive-tree.png` | Sunlit Lavender Doorway with Olive Tree.png | 1448 × 1086 | Preserved alternative editorial artwork, not used as property imagery |
| `topographic-mandala.png` | Previously renamed Minimalist Purple Topographic Mandala.png | 1672 × 941 | Preserved earlier artwork, no longer displayed in hero |
| `room.svg`, `living.svg`, `building.svg` | Unchanged | 800 × 520 viewBox | Demo room/common-area/building illustrations |

The hero map preserves its full native aspect ratio with no oval, circle, card, frame or cover crop. Restrained multiply blending and a short horizontal edge fade soften its integration with the canvas. Copy and search occupy separate layout areas. At tablet sizes artwork gets less width; mobile uses a compact full-ratio image. Doorway artwork stays in the existing owner CTA section, uncropped and below the CTA on mobile.

`src/components/listing-imagery.ts` centralizes a stable ID/category-based presentation mapping for demo listings. Cards and galleries use the same selection. Non-demo image paths pass through unchanged. Database image rows and seed data are untouched. Brand map/doorway artwork is never used in property cards or galleries. There is only one newly supplied bedroom scene; existing SVG scenes provide additional variation, so some reuse remains. Additional distinct bedroom, kitchen, bathroom and apartment-interior illustrations would improve diversity.

All displayed images use `next/image`, responsive sizes and explicit intrinsic dimensions. Only the hero and primary detail image receive priority; below-fold images are lazy-loaded by default. Concept/demonstration labels and non-photograph alt text remain explicit. Gallery images use contain to avoid cropping important illustrative details.

## UI refinements

Homepage cards prioritize image, title, locality, price, attributes, brokerage label and detail navigation. They show monthly maintenance and disclose additional costs, but move the full deposit/maintenance/brokerage breakdown to results and details. A stretched accessible title link makes cards navigable. Results retain full charge breakdowns. Header navigation now marks the current category with `aria-current`, violet and an underline.

Search URL filters, category semantics, sorting, pagination and validation remain unchanged. Native collapsible filters, unique IDs, keyboard focus and reduced-motion rules are retained. No accounts, submissions, messaging, payments, AI, geocoding or verification service was added.

## Fonts

The default pair is bundled through `next/font/local`, regular variable sources with 400–700 CSS weight ranges, swap behavior and Arial/sans-serif fallbacks. Original glyph sets remain; no manual subsetting was performed. Original SIL Open Font License/copyright notices are under `docs/licenses`. No build-time or browser font-service dependency is required.

## Validation

Lint, typecheck, 21 unit tests, 15 isolated PostgreSQL integration tests, production build and 18 production browser tests passed. Responsive checks cover 375px, 768px and 1440px, including no horizontal overflow, artwork/copy separation, full hero image ratio, successful image decoding and HTTP 200 asset requests. The development reference test checks shared controls, unique IDs and 4.5:1 main small-text color pairs; it also captures browser errors. Original discovery tests remain in place. The outdated multi-theme test scope was updated to the explicitly selected single identity, not removed.

The isolated development suite cannot start while another `next dev` instance holds the workspace lock. In this session the same reference test was run against the already-running local development server, without stopping it. Chrome/mobile emulation was used; Safari, Firefox, physical devices and assistive technology are not covered. Targeted contrast checks do not constitute a comprehensive WCAG audit.

## Focused consistency pass

- Demo flatshare covers now use only the two supplied bedroom illustrations; entire rental/sale covers use living-area or building illustrations. Supporting gallery images retain relevant interior/common-area/building context. The centralized selection stays deterministic and shared by cards/details.
- Result cards omit a redundant zero-brokerage cost row when the explicit “No brokerage” tag already communicates it. Nonzero brokerage, deposits and monthly maintenance remain itemized; detail pages retain the complete breakdown.
- Card metadata and actions use at least 13px text; tags and gallery captions use 12px. Form controls use 16px text, and footer links retain 44px targets. Existing theme colors, fonts and focus treatments are unchanged.
- The hero edge fade is narrower, preserving more visible contour detail. Mobile artwork no longer has reduced opacity. No crop, frame, container or new visual effect was added.
- Owner artwork uses the shared 9px inner radius, explicit center alignment and consistent desktop/mobile spacing without changing its aspect ratio.
- Additional unit tests enforce category-appropriate covers. Responsive browser tests decode card/gallery images and verify cover categories, image ratio and owner radius at 375/768/1440px. The broader six-route test has a 60-second budget for lazy-image scrolling; no assertions were removed.

```sh
# After npm run build; requires a separate migrated/seeded TEST_DATABASE_URL
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
# When no other development server is running
PLAYWRIGHT_CHANNEL=chrome npx playwright test --config=playwright.design.config.ts
```

Do not run production/development builds concurrently against the same output directory. Backend modules, migrations, seed data and future geographic interfaces were verified unchanged by checksums. No commit, push or deployment was performed.
