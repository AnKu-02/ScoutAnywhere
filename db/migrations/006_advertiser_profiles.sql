-- Account-controlled advertisers reuse the existing entity without claiming fixtures.
ALTER TABLE advertisers DROP CONSTRAINT advertisers_kind_check;
ALTER TABLE advertisers ADD CONSTRAINT advertisers_kind_check
  CHECK (kind IN ('owner','broker','tenant','developer'));
ALTER TABLE advertisers ADD COLUMN owner_user_id text UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE;
ALTER TABLE advertisers ADD CONSTRAINT advertisers_account_not_demo CHECK (owner_user_id IS NULL OR NOT is_demo);
ALTER TABLE advertisers ADD CONSTRAINT advertisers_id_owner_unique UNIQUE(id,owner_user_id);

CREATE TABLE advertiser_profiles (
  advertiser_id integer PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  FOREIGN KEY(advertiser_id,user_id) REFERENCES advertisers(id,owner_user_id) ON DELETE CASCADE,
  primary_city text NOT NULL CHECK (primary_city IN ('Bengaluru','Mumbai')),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=600),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 'active' enables profile editing only; it conveys no verification or listing rights.
CREATE TABLE advertiser_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id integer NOT NULL REFERENCES advertiser_profiles(advertiser_id) ON DELETE CASCADE,
  previous_status text CHECK (previous_status IN ('active','suspended')),
  status text NOT NULL CHECK (status IN ('active','suspended')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  database_actor text NOT NULL DEFAULT current_user
);
CREATE INDEX advertiser_status_events_profile_idx ON advertiser_status_events(advertiser_id,changed_at DESC,id DESC);

CREATE FUNCTION record_advertiser_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.advertiser_id<>OLD.advertiser_id OR NEW.user_id<>OLD.user_id THEN
      RAISE EXCEPTION 'Advertiser account relationships cannot be reassigned';
    END IF;
    NEW.created_at:=OLD.created_at;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER advertiser_profile_update BEFORE UPDATE ON advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION record_advertiser_status();

CREATE FUNCTION audit_advertiser_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO advertiser_status_events(advertiser_id,previous_status,status) VALUES(NEW.advertiser_id,NULL,NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO advertiser_status_events(advertiser_id,previous_status,status) VALUES(NEW.advertiser_id,OLD.status,NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER advertiser_profile_status_audit AFTER INSERT OR UPDATE ON advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_advertiser_status();

CREATE TABLE advertiser_profile_write_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL CHECK (request_count>0)
);