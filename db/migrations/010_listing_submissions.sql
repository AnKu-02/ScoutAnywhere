-- Separate private review domain. Public properties/units/listings remain unchanged.
ALTER TABLE account_capabilities DROP CONSTRAINT account_capabilities_capability_check;
ALTER TABLE account_capabilities ADD CONSTRAINT account_capabilities_capability_check CHECK(capability IN ('administrator','advertiser','moderator'));

CREATE TABLE moderator_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL, granted boolean NOT NULL,
  database_actor text NOT NULL DEFAULT current_user, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION audit_moderator_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.capability='moderator' THEN INSERT INTO moderator_access_events(user_id,granted) VALUES(NEW.user_id,true);
  ELSIF TG_OP='DELETE' AND OLD.capability='moderator' THEN INSERT INTO moderator_access_events(user_id,granted) VALUES(OLD.user_id,false); END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER moderator_access_audit AFTER INSERT OR DELETE ON account_capabilities FOR EACH ROW EXECUTE FUNCTION audit_moderator_access();

CREATE TABLE listing_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Historical identifiers intentionally survive account/draft deletion; no contact details copied.
  draft_id uuid NOT NULL, user_id text NOT NULL, advertiser_id integer NOT NULL,
  advertiser_name text NOT NULL,
  request_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  previous_id uuid REFERENCES listing_submissions(id),
  category text NOT NULL CHECK(category IN ('flatshares','rent','buy')),
  content jsonb NOT NULL CHECK(valid_listing_draft(content) AND content->>'category'=category),
  photos jsonb NOT NULL CHECK(jsonb_typeof(photos)='array' AND jsonb_array_length(photos) BETWEEN 1 AND 12),
  policy_version text NOT NULL,
  text_version integer NOT NULL CHECK(text_version>0), media_version integer NOT NULL CHECK(media_version>0),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','changes_requested','approved','rejected','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, retain_until timestamptz,
  UNIQUE(user_id,request_id),
  CHECK((state='pending' AND decided_at IS NULL AND retain_until IS NULL) OR (state<>'pending' AND decided_at IS NOT NULL AND retain_until>decided_at))
);
CREATE UNIQUE INDEX submission_one_pending ON listing_submissions(draft_id) WHERE state='pending';
CREATE INDEX submission_owner ON listing_submissions(user_id,created_at DESC,id DESC);
CREATE INDEX submission_history ON listing_submissions(draft_id,created_at DESC,id DESC);
CREATE INDEX submission_retention ON listing_submissions(retain_until);
CREATE TABLE submission_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES listing_submissions(id),
  actor_id text NOT NULL,
  previous_state text CHECK(previous_state='pending'),
  state text NOT NULL CHECK(state IN ('pending','changes_requested','approved','rejected','withdrawn')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 2000),
  version integer NOT NULL CHECK(version>0),
  retention_days integer CHECK(retention_days BETWEEN 1 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,version)
);
CREATE TABLE submission_write_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 30)
);
CREATE FUNCTION immutable_review_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Review audit records are append-only'; END; $$;
CREATE TRIGGER submission_event_immutable BEFORE UPDATE OR DELETE ON submission_events FOR EACH ROW EXECUTE FUNCTION immutable_review_record();
CREATE TRIGGER moderator_event_immutable BEFORE UPDATE OR DELETE ON moderator_access_events FOR EACH ROW EXECUTE FUNCTION immutable_review_record();

CREATE FUNCTION protect_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Submission history cannot be deleted by ordinary operations'; END IF;
  IF pg_trigger_depth()<2 OR (to_jsonb(NEW)-ARRAY['state','version','decided_at','retain_until']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','decided_at','retain_until']) THEN
    RAISE EXCEPTION 'Submission snapshots are immutable; lifecycle changes require an event';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON listing_submissions FOR EACH ROW EXECUTE FUNCTION protect_submission();

CREATE FUNCTION apply_submission_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s listing_submissions;
BEGIN
  SELECT * INTO STRICT s FROM listing_submissions WHERE id=NEW.submission_id FOR UPDATE;
  NEW.created_at:=clock_timestamp();
  IF NEW.state='pending' THEN
    IF NEW.previous_state IS NOT NULL OR NEW.version<>1 OR s.version<>1 OR s.state<>'pending' OR NEW.actor_id<>s.user_id OR NEW.retention_days IS NOT NULL THEN RAISE EXCEPTION 'Invalid submission event'; END IF;
    RETURN NEW;
  END IF;
  IF s.state<>'pending' OR NEW.previous_state<>'pending' OR NEW.version<>s.version+1 OR NEW.retention_days IS NULL THEN RAISE EXCEPTION 'Stale or terminal submission'; END IF;
  IF NEW.state='withdrawn' THEN
    IF NEW.actor_id<>s.user_id THEN RAISE EXCEPTION 'Only submitter may withdraw'; END IF;
  ELSE
    IF NEW.actor_id=s.user_id OR NOT EXISTS(SELECT 1 FROM account_capabilities c JOIN auth_user u ON u.id=c.user_id WHERE c.user_id=NEW.actor_id AND c.capability='moderator' AND u."emailVerified") THEN RAISE EXCEPTION 'Moderator permission required; self-review forbidden'; END IF;
  END IF;
  UPDATE listing_submissions SET state=NEW.state,version=NEW.version,decided_at=NEW.created_at,retain_until=NEW.created_at+make_interval(days=>NEW.retention_days) WHERE id=s.id;
  RETURN NEW;
END; $$;
CREATE TRIGGER submission_event_apply BEFORE INSERT ON submission_events FOR EACH ROW EXECUTE FUNCTION apply_submission_event();

-- Do not leave pending photographs retained indefinitely after a future account deletion.
CREATE FUNCTION block_pending_account_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM listing_submissions WHERE user_id=OLD.id AND state='pending') THEN RAISE EXCEPTION 'Withdraw pending submissions before account deletion'; END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER pending_submission_account_delete BEFORE DELETE ON auth_user FOR EACH ROW EXECUTE FUNCTION block_pending_account_deletion();