-- Further defense in depth; applied migrations remain untouched.
CREATE FUNCTION protect_draft_photograph() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.storage_key<>OLD.storage_key OR NEW.request_id<>OLD.request_id OR NEW.input_hash<>OLD.input_hash
      OR (NEW.draft_id IS NOT NULL AND NEW.draft_id IS DISTINCT FROM OLD.draft_id)
      OR (NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
      RAISE EXCEPTION 'Photograph identity and ownership are immutable';
    END IF;
    NEW.created_at:=OLD.created_at;
    NEW.updated_at:=now();
  END IF;
  IF NEW.draft_id IS NOT NULL AND NEW.owner_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM listing_drafts WHERE id=NEW.draft_id AND user_id=NEW.owner_id
  ) THEN RAISE EXCEPTION 'Photograph must belong to its draft account'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER draft_photo_integrity BEFORE INSERT OR UPDATE ON draft_photographs FOR EACH ROW EXECUTE FUNCTION protect_draft_photograph();