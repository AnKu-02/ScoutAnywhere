CREATE TABLE saved_listings (
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX saved_listings_user_recent_idx ON saved_listings(user_id, saved_at DESC, listing_id DESC);
CREATE INDEX saved_listings_listing_idx ON saved_listings(listing_id);
-- A bounded, per-account write bucket shared across application instances.
CREATE TABLE saved_listing_write_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL CHECK (request_count > 0)
);