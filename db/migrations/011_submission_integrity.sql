-- Forward-only hardening after exercising 010 locally; no applied migration edits.
CREATE FUNCTION validate_submission_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d listing_drafts; p jsonb; expected jsonb; previous listing_submissions;
BEGIN
  PERFORM id FROM auth_user WHERE id=NEW.user_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM advertiser_profiles ap JOIN advertisers a ON a.id=ap.advertiser_id WHERE ap.user_id=NEW.user_id AND ap.advertiser_id=NEW.advertiser_id AND ap.status='active' AND NOT a.is_demo) THEN RAISE EXCEPTION 'Eligible advertiser required'; END IF;
  SELECT * INTO STRICT d FROM listing_drafts WHERE id=NEW.draft_id AND user_id=NEW.user_id AND advertiser_id=NEW.advertiser_id FOR UPDATE;
  IF NEW.content IS DISTINCT FROM d.content OR NEW.category<>d.category OR NEW.text_version<>d.version OR NEW.state<>'pending' OR NEW.version<>1 OR NEW.decided_at IS NOT NULL OR NEW.retain_until IS NOT NULL THEN RAISE EXCEPTION 'Snapshot must match the locked draft'; END IF;
  IF NOT EXISTS(SELECT 1 FROM draft_media_state WHERE draft_id=d.id AND version=NEW.media_version) OR EXISTS(SELECT 1 FROM draft_photographs WHERE draft_id=d.id AND state='pending') THEN RAISE EXCEPTION 'Inconsistent photo capture'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'key',storage_key,'width',width,'height',height,'size',byte_size,'cover',is_cover,'order',display_order) ORDER BY display_order,id) INTO expected FROM draft_photographs WHERE draft_id=d.id AND state='ready';
  IF NEW.photos IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Snapshot must capture all ready photographs'; END IF;
  SELECT * INTO previous FROM listing_submissions WHERE draft_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1;
  IF FOUND THEN
    IF previous.state NOT IN ('changes_requested','withdrawn') OR NEW.previous_id IS DISTINCT FROM previous.id THEN RAISE EXCEPTION 'Invalid resubmission chain'; END IF;
  ELSIF NEW.previous_id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected previous submission'; END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END; $$;
CREATE TRIGGER submission_capture_integrity BEFORE INSERT ON listing_submissions FOR EACH ROW EXECUTE FUNCTION validate_submission_capture();

CREATE FUNCTION require_submission_initial_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM submission_events WHERE submission_id=NEW.id AND version=1 AND state='pending' AND actor_id=NEW.user_id) THEN RAISE EXCEPTION 'Submission requires an attributed creation event'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER submission_creation_audit AFTER INSERT ON listing_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_submission_initial_event();

CREATE FUNCTION protect_capability_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.capability IS DISTINCT FROM OLD.capability THEN RAISE EXCEPTION 'Revoke and grant capabilities explicitly'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER capability_identity BEFORE UPDATE ON account_capabilities FOR EACH ROW EXECUTE FUNCTION protect_capability_identity();