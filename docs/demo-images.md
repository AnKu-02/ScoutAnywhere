# Supplied public demonstration photographs

These static assets illustrate fictional listings. They do not establish real availability, location, ownership or authenticity, and are completely separate from private draft uploads.

## Assigned galleries (first file is the cover)

Files remain at `public/images/demo/` with their original names.

| Existing local listing | Category / locality | Ordered files |
| --- | --- | --- |
| 1 — Private room in a shared home · HSR Layout | Flatshare, Bengaluru | `Cosy Modern Bedroom Study Retreat.png`; `Sunlit Modern Boho Living Room.png`; `Sunlit Olive-Green Kitchen with Plants.png`; `Bright Modern Bathroom with Greenery.png`; `Sunlit Urban Balcony Retreat.png` |
| 14 — 2 BHK for rent · Powai | Rental, Mumbai | `Sunlit Modern Living Room with City Views.png`; `2B_Powai_master_bedroom.png`; `2C_Powai_second_bedroom.png`; `2D_Powai_kitchen.png`; `2E_Powai_building_exterior.png` |
| 6 — 3 BHK for sale · Whitefield | Sale, Bengaluru | `3A_Whitefield_living_room.png`; `3B_Whitefield_dining_area.png`; `3C_Whitefield_master_bedroom.png`; `3D_Whitefield_kitchen.png`; `3E_Whitefield_balcony_view.png` |

`Warm Modern Bedrooms with City Views.png` is preserved but unused: it is a composite of the bedroom scenes already supplied separately. All 16 supplied files exist; 15 are assigned. No originals were moved, renamed or deleted.

## Applying references

```bash
ALLOW_DEMO_SEED=true npm run db:demo-images
```

The non-production command uses the configured development database and existing `property_images` table, not a new schema or migration. Fresh demo seeding invokes the same update. For an existing isolated test database:

```bash
node --env-file=.env --import tsx --input-type=module -e 'if (!process.env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error("Separate database required"); process.env.DATABASE_URL=process.env.TEST_DATABASE_URL; process.env.ALLOW_DEMO_SEED="true"; await import("./scripts/update-demo-images.ts")'
```

The updater resolves exactly one matching demo listing per category/city/locality/BHK rather than assuming IDs. It requires demo advertisers with no account owner and refuses shared properties or unexpected custom image references. A transaction and advisory lock protect the update. Only the three target properties' image references are replaced (three illustration rows become five photo rows each). Listing, property, unit, advertiser, price, description and permission values remain unchanged; all 24 demo listings and 24 demo advertisers are retained. Unchanged galleries are a no-op, including image-row IDs.

The original listing descriptions are intentionally retained, including their historical illustration wording. The current gallery and card disclosures explicitly identify the assigned assets as fictional demo imagery, not verified available properties. Other listings keep their original illustration selection.

## Display and separation

One typed asset manifest supplies measured dimensions, captions and meaningful alt text. Database ordering controls covers and galleries. Cards, homepage previews where selected, details and Saved Properties share the existing image-selection function. The homepage's unchanged recent-flatshare selection currently does not include HSR Layout; this task does not reorder or promote listings to force a photo onto the homepage.

Cards retain their existing cropped aspect ratio and rounded corners. Photo detail galleries display all five images, with a larger cover and responsive secondary tiles using `object-fit: contain` to preserve portrait/landscape composition. Existing Next image optimization, responsive sizes and lazy loading remain in use; the first detail image retains priority loading. No watermark, verification badge or overlay is added to the supplied photos; demo card disclosure appears below the image instead.

Private media routes, object storage, authorization, quotas, processing and database migrations are untouched. Production public assets should be reviewed for usage rights and sensitive/embedded data before deployment; supplied images have not been independently authenticated or licensed by the application.

## Validation

Lint and TypeScript passed. Unit/API tests: 152 passed. Isolated integration tests: 53 passed, including repeatability, unchanged record snapshots and common detail/search/saved projections. Development update affected only listings 1/14/6; a second run returned no changes. Production build passed. Full production desktop/mobile browser suite: 33 passed, one existing intentional skip. Development Electric Calm design-reference test: one passed. Browser assertions cover supplied public asset responses, optimized image decoding, cover selection, five-image order, Saved Properties, filters, desktop/mobile overflow, and the existing private photo upload/cover/order/access-control journey. Screenshots were generated at 375, 768 and 1440 pixels. Build → production browser suite → development design-reference checks ran sequentially. Initial browser runs exposed illustration-only expectations and hidden retained React route selectors; those tests were updated and the complete suite rerun successfully. No hands-on real-device acceptance is claimed.