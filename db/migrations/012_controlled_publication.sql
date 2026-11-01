ALTER TABLE account_capabilities DROP CONSTRAINT account_capabilities_capability_check;
ALTER TABLE account_capabilities ADD CONSTRAINT account_capabilities_capability_check CHECK(capability IN ('administrator','advertiser','moderator','publisher'));
CREATE TABLE publisher_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id text NOT NULL,granted boolean NOT NULL,
  database_actor text NOT NULL DEFAULT current_user,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION audit_publisher_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.capability='publisher' THEN INSERT INTO publisher_access_events(user_id,granted) VALUES(NEW.user_id,true);
  ELSIF TG_OP='DELETE' AND OLD.capability='publisher' THEN INSERT INTO publisher_access_events(user_id,granted) VALUES(OLD.user_id,false); END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER publisher_access_audit AFTER INSERT OR DELETE ON account_capabilities FOR EACH ROW EXECUTE FUNCTION audit_publisher_access();
CREATE TRIGGER publisher_access_immutable BEFORE UPDATE OR DELETE ON publisher_access_events FOR EACH ROW EXECUTE FUNCTION immutable_review_record();

-- Non-demo records keep approved public disclosures separate from private review metadata.
ALTER TABLE listings ALTER COLUMN maintenance DROP NOT NULL;
ALTER TABLE listings ADD COLUMN advertiser_name text;
ALTER TABLE listings ADD COLUMN declared_relationship text CHECK(declared_relationship IN ('owner','broker','tenant'));
ALTER TABLE listings ADD COLUMN public_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(public_details)='object');
ALTER TABLE property_images ADD COLUMN is_cover boolean NOT NULL DEFAULT false;

CREATE TABLE listing_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES listing_submissions(id),draft_id uuid NOT NULL UNIQUE,
  listing_id integer UNIQUE REFERENCES listings(id),
  state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','published','unpublished')),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  CHECK((state='preparing' AND listing_id IS NULL) OR (state<>'preparing' AND listing_id IS NOT NULL))
);
CREATE TABLE publication_media (
  publication_id uuid NOT NULL REFERENCES listing_publications(id),photo_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^publications/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
  checksum text CHECK(checksum ~ '^[a-f0-9]{64}$'),
  removed_at timestamptz,
  PRIMARY KEY(publication_id,photo_id)
);
CREATE TABLE publication_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publication_id uuid NOT NULL REFERENCES listing_publications(id),submission_id uuid NOT NULL REFERENCES listing_submissions(id),
  listing_id integer NOT NULL REFERENCES listings(id),actor_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('publish','unpublish')),
  previous_state text NOT NULL CHECK(previous_state IN ('preparing','published')),
  resulting_state text NOT NULL CHECK(resulting_state IN ('published','unpublished')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 2000),created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(publication_id,action)
);
CREATE TRIGGER publication_event_immutable BEFORE UPDATE OR DELETE ON publication_events FOR EACH ROW EXECUTE FUNCTION immutable_review_record();
CREATE INDEX publication_cleanup ON listing_publications(state,lease_until);

CREATE FUNCTION guard_publication_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Publication history cannot be deleted'; END IF;
  IF NEW.id<>OLD.id OR NEW.submission_id<>OLD.submission_id OR NEW.draft_id<>OLD.draft_id OR (OLD.listing_id IS NOT NULL AND NEW.listing_id IS DISTINCT FROM OLD.listing_id) OR (OLD.state='unpublished' AND NEW.state<>'unpublished') THEN RAISE EXCEPTION 'Publication identity and terminal state are immutable'; END IF;
  NEW.created_at:=OLD.created_at;NEW.updated_at:=clock_timestamp();RETURN NEW;
END; $$;
CREATE TRIGGER publication_identity BEFORE UPDATE OR DELETE ON listing_publications FOR EACH ROW EXECUTE FUNCTION guard_publication_identity();

CREATE FUNCTION validate_publication_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p listing_publications; s listing_submissions;
BEGIN
  SELECT * INTO STRICT p FROM listing_publications WHERE id=NEW.publication_id FOR UPDATE;
  SELECT * INTO STRICT s FROM listing_submissions WHERE id=p.submission_id;
  IF NOT EXISTS(SELECT 1 FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=NEW.actor_id AND c.capability='publisher' AND u."emailVerified") OR NEW.actor_id=s.user_id THEN RAISE EXCEPTION 'Independent publishing operator required'; END IF;
  IF NEW.submission_id<>p.submission_id OR NEW.listing_id<>p.listing_id OR s.state<>'approved' THEN RAISE EXCEPTION 'Publication linkage mismatch'; END IF;
  IF (NEW.action='publish' AND (NEW.previous_state<>'preparing' OR NEW.resulting_state<>'published' OR p.state<>'published' OR s.retain_until<=clock_timestamp())) OR (NEW.action='unpublish' AND (NEW.previous_state<>'published' OR NEW.resulting_state<>'unpublished' OR p.state<>'unpublished')) THEN RAISE EXCEPTION 'Invalid publication transition'; END IF;
  IF NOT EXISTS(SELECT 1 FROM listings l JOIN advertisers a ON a.id=l.advertiser_id WHERE l.id=p.listing_id AND NOT l.is_demo AND NOT a.is_demo AND a.id=s.advertiser_id AND l.status=CASE WHEN p.state='published' THEN 'published' ELSE 'archived' END) THEN RAISE EXCEPTION 'Public record inconsistent'; END IF;
  NEW.created_at:=clock_timestamp();RETURN NEW;
END; $$;
CREATE TRIGGER publication_event_check BEFORE INSERT ON publication_events FOR EACH ROW EXECUTE FUNCTION validate_publication_event();

CREATE FUNCTION require_publication_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state<>'preparing' AND NOT EXISTS(SELECT 1 FROM publication_events WHERE publication_id=NEW.id AND resulting_state=NEW.state AND listing_id=NEW.listing_id) THEN RAISE EXCEPTION 'Publication state requires attributed event'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER publication_state_audit AFTER INSERT OR UPDATE ON listing_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_publication_event();

CREATE FUNCTION protect_live_advertiser_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM listing_publications p JOIN listing_submissions s ON s.id=p.submission_id WHERE s.user_id=OLD.id) THEN RAISE EXCEPTION 'Publication privacy/deletion requires an operator workflow'; END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER publication_account_delete BEFORE DELETE ON auth_user FOR EACH ROW EXECUTE FUNCTION protect_live_advertiser_deletion();