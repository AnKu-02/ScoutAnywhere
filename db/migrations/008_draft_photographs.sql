-- Private media is deliberately separate from public property_images.
CREATE TABLE draft_media_state (
  draft_id uuid PRIMARY KEY REFERENCES listing_drafts(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE draft_photographs (
  id uuid PRIMARY KEY,
  draft_id uuid REFERENCES listing_drafts(id) ON DELETE SET NULL,
  owner_id text REFERENCES auth_user(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^drafts/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
  state text NOT NULL CHECK(state IN ('pending','ready','deleting','deleted')),
  content_type text NOT NULL DEFAULT 'image/webp' CHECK(content_type='image/webp'),
  width integer CHECK(width BETWEEN 1 AND 2560),
  height integer CHECK(height BETWEEN 1 AND 2560),
  byte_size integer CHECK(byte_size BETWEEN 1 AND 5242880),
  display_order integer NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 11),
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  CHECK(state<>'ready' OR (width IS NOT NULL AND height IS NOT NULL AND byte_size IS NOT NULL)),
  UNIQUE(owner_id,request_id)
);
CREATE UNIQUE INDEX draft_photo_cover_idx ON draft_photographs(draft_id) WHERE is_cover AND state='ready';
CREATE UNIQUE INDEX draft_photo_order_idx ON draft_photographs(draft_id,display_order) WHERE state='ready';
CREATE INDEX draft_photo_owner_idx ON draft_photographs(owner_id,state);
CREATE INDEX draft_photo_cleanup_idx ON draft_photographs(state,expires_at);
CREATE INDEX draft_photo_draft_idx ON draft_photographs(draft_id);
CREATE TABLE draft_media_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 40)
);