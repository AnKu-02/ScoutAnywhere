-- Forward-only hardening after validating 012. Prior migrations remain unchanged.
CREATE OR REPLACE FUNCTION guard_publication_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s listing_submissions;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Publication history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO STRICT s FROM listing_submissions WHERE id=NEW.submission_id;
    IF NEW.draft_id<>s.draft_id OR s.state<>'approved' OR NEW.state<>'preparing' OR NEW.listing_id IS NOT NULL THEN RAISE EXCEPTION 'Publication must reserve an approved snapshot'; END IF;
    NEW.created_at:=clock_timestamp();NEW.updated_at:=NEW.created_at;RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.submission_id<>OLD.submission_id OR NEW.draft_id<>OLD.draft_id OR (OLD.listing_id IS NOT NULL AND NEW.listing_id IS DISTINCT FROM OLD.listing_id) OR (OLD.state='unpublished' AND NEW.state<>'unpublished') OR (OLD.state='published' AND NEW.state NOT IN ('published','unpublished')) OR (OLD.state='preparing' AND NEW.state NOT IN ('preparing','published')) THEN RAISE EXCEPTION 'Publication identity and lifecycle are immutable'; END IF;
  NEW.created_at:=OLD.created_at;NEW.updated_at:=clock_timestamp();RETURN NEW;
END; $$;
DROP TRIGGER publication_identity ON listing_publications;
CREATE TRIGGER publication_identity BEFORE INSERT OR UPDATE OR DELETE ON listing_publications FOR EACH ROW EXECUTE FUNCTION guard_publication_identity();

CREATE FUNCTION guard_publication_media() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p listing_publications; s listing_submissions;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Publication media receipts cannot be deleted'; END IF;
  SELECT * INTO STRICT p FROM listing_publications WHERE id=NEW.publication_id;
  IF TG_OP='INSERT' THEN
    SELECT * INTO STRICT s FROM listing_submissions WHERE id=p.submission_id;
    IF p.state<>'preparing' OR NEW.storage_key<>'publications/'||p.id::text||'/'||NEW.photo_id::text||'.webp' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.photos) photo WHERE photo->>'id'=NEW.photo_id::text AND (photo->>'size')::integer=NEW.byte_size) THEN RAISE EXCEPTION 'Media must reference exact submitted photographs'; END IF;
  ELSE
    IF NEW.publication_id<>OLD.publication_id OR NEW.photo_id<>OLD.photo_id OR NEW.storage_key<>OLD.storage_key OR NEW.byte_size<>OLD.byte_size OR (p.state<>'preparing' AND NEW.checksum IS DISTINCT FROM OLD.checksum) OR (p.state='published' AND NEW.removed_at IS DISTINCT FROM OLD.removed_at) THEN RAISE EXCEPTION 'Publication media identity is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER publication_media_integrity BEFORE INSERT OR UPDATE OR DELETE ON publication_media FOR EACH ROW EXECUTE FUNCTION guard_publication_media();

CREATE OR REPLACE FUNCTION require_publication_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s listing_submissions;
BEGIN
  IF NEW.state<>'preparing' AND NOT EXISTS(SELECT 1 FROM publication_events WHERE publication_id=NEW.id AND resulting_state=NEW.state AND listing_id=NEW.listing_id) THEN RAISE EXCEPTION 'Publication state requires attributed event'; END IF;
  IF NEW.state='published' THEN
    SELECT * INTO STRICT s FROM listing_submissions WHERE id=NEW.submission_id;
    IF (SELECT count(*) FROM publication_media WHERE publication_id=NEW.id AND checksum IS NOT NULL AND removed_at IS NULL)<>jsonb_array_length(s.photos) THEN RAISE EXCEPTION 'Complete verified public media required'; END IF;
    IF NOT EXISTS(SELECT 1 FROM listings l JOIN units u ON u.id=l.unit_id JOIN properties pr ON pr.id=u.property_id WHERE l.id=NEW.listing_id AND l.category=s.category AND l.advertiser_id=s.advertiser_id AND l.status='published' AND NOT l.is_demo AND NOT pr.is_demo AND l.advertiser_name=s.advertiser_name AND l.declared_relationship=s.content->>'relationship') THEN RAISE EXCEPTION 'Public records must match approved identity'; END IF;
  END IF;
  RETURN NULL;
END; $$;