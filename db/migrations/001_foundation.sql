CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE cities (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE, state text NOT NULL
);
CREATE TABLE locations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id integer NOT NULL REFERENCES cities(id), locality text NOT NULL,
  pin_code text NOT NULL CHECK (pin_code ~ '^[1-9][0-9]{5}$'),
  UNIQUE(city_id, locality)
);
CREATE TABLE advertisers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name text NOT NULL, kind text NOT NULL CHECK (kind IN ('owner','broker','developer')),
  is_demo boolean NOT NULL DEFAULT true
);
CREATE TABLE properties (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id integer NOT NULL REFERENCES locations(id), building text NOT NULL,
  address_line text NOT NULL, property_type text NOT NULL CHECK (property_type IN ('apartment','independent-house')),
  coordinates geography(Point,4326), is_demo boolean NOT NULL DEFAULT true
);
CREATE INDEX properties_coordinates_gist ON properties USING gist(coordinates);
CREATE INDEX properties_location_idx ON properties(location_id);
CREATE TABLE units (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id integer NOT NULL REFERENCES properties(id), kind text NOT NULL CHECK (kind IN ('room','entire-home')),
  label text NOT NULL, bhk integer CHECK (bhk BETWEEN 1 AND 10), carpet_sqft integer CHECK (carpet_sqft > 0),
  furnishing text NOT NULL CHECK (furnishing IN ('furnished','semi-furnished','unfurnished')),
  household_size integer CHECK (household_size >= 0), house_rules text,
  UNIQUE(id,kind),
  CHECK ((kind='room' AND bhk IS NULL AND carpet_sqft IS NULL AND household_size IS NOT NULL) OR (kind='entire-home' AND bhk IS NOT NULL))
);
CREATE TABLE listings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id integer NOT NULL, unit_kind text NOT NULL,
  FOREIGN KEY(unit_id,unit_kind) REFERENCES units(id,kind),
  advertiser_id integer NOT NULL REFERENCES advertisers(id),
  category text NOT NULL CHECK (category IN ('flatshares','rent','buy')),
  title text NOT NULL, description text NOT NULL,
  price bigint NOT NULL CHECK (price > 0 AND price <= 10000000000),
  deposit bigint CHECK (deposit >= 0), maintenance integer NOT NULL DEFAULT 0 CHECK (maintenance >= 0),
  brokerage bigint NOT NULL DEFAULT 0 CHECK (brokerage >= 0),
  available_from date, published_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  is_demo boolean NOT NULL DEFAULT true,
  CHECK ((category='flatshares' AND unit_kind='room') OR (category IN ('rent','buy') AND unit_kind='entire-home')),
  CHECK (category='buy' OR (deposit IS NOT NULL AND available_from IS NOT NULL)),
  CHECK (category <> 'buy' OR available_from IS NULL)
);
CREATE INDEX listings_category_price_idx ON listings(category,price,id) WHERE status='published';
CREATE INDEX listings_category_recent_idx ON listings(category,published_at DESC,id DESC) WHERE status='published';
CREATE INDEX listings_unit_idx ON listings(unit_id);
CREATE INDEX locations_locality_idx ON locations(lower(locality));
CREATE INDEX cities_name_idx ON cities(lower(name));
CREATE TABLE property_images (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id integer NOT NULL REFERENCES properties(id), unit_id integer REFERENCES units(id),
  path text NOT NULL CHECK (path LIKE '/images/%'), alt text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX property_images_property_idx ON property_images(property_id,sort_order);
CREATE TABLE amenities (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE property_amenities (
  property_id integer NOT NULL REFERENCES properties(id), amenity_id integer NOT NULL REFERENCES amenities(id),
  PRIMARY KEY(property_id,amenity_id)
);