-- Keep unit-specific images on the same physical property.
ALTER TABLE units ADD CONSTRAINT units_id_property_unique UNIQUE(id,property_id);
ALTER TABLE property_images ADD CONSTRAINT images_unit_property_fk
  FOREIGN KEY(unit_id,property_id) REFERENCES units(id,property_id);
-- Entire residential homes require carpet area; rooms deliberately omit it.
ALTER TABLE units ADD CONSTRAINT entire_home_area_required
  CHECK (kind <> 'entire-home' OR carpet_sqft IS NOT NULL);