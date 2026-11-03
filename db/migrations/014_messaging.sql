-- Private text messaging references advertisements, never review snapshots or copies.
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id integer NOT NULL REFERENCES listings(id),
  seeker_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  advertiser_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  latest_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(seeker_id<>advertiser_id), UNIQUE(listing_id,seeker_id)
);
CREATE INDEX conversations_seeker_activity ON conversations(seeker_id,latest_activity_at DESC,id);
CREATE INDEX conversations_advertiser_activity ON conversations(advertiser_id,latest_activity_at DESC,id);
CREATE TABLE conversation_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(sender_id,request_id)
);
CREATE INDEX messages_history ON conversation_messages(conversation_id,id DESC);
CREATE INDEX messages_sender_history ON conversation_messages(conversation_id,sender_id,id DESC);
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  read_through bigint NOT NULL DEFAULT 0 CHECK(read_through>=0),
  dismissed_exchange bigint CHECK(dismissed_exchange>0),
  PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE messaging_write_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  minute_started timestamptz NOT NULL DEFAULT clock_timestamp(),
  minute_count integer NOT NULL DEFAULT 1,
  day_started timestamptz NOT NULL DEFAULT clock_timestamp(),
  day_count integer NOT NULL DEFAULT 1,
  CHECK(minute_count BETWEEN 1 AND 20), CHECK(day_count BETWEEN 1 AND 200)
);
CREATE FUNCTION guard_conversation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.listing_id,NEW.seeker_id,NEW.advertiser_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.listing_id,OLD.seeker_id,OLD.advertiser_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Conversation relationships are immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversation_identity BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION guard_conversation_identity();
CREATE FUNCTION guard_message_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM conversations WHERE id=NEW.conversation_id AND NEW.sender_id IN (seeker_id,advertiser_id)) THEN RAISE EXCEPTION 'Conversation participant required'; END IF;
  NEW.created_at:=clock_timestamp(); RETURN NEW;
END; $$;
CREATE TRIGGER message_participant BEFORE INSERT ON conversation_messages FOR EACH ROW EXECUTE FUNCTION guard_message_participant();
CREATE FUNCTION guard_read_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM conversations WHERE id=NEW.conversation_id AND NEW.user_id IN (seeker_id,advertiser_id)) THEN RAISE EXCEPTION 'Conversation participant required'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER read_participant BEFORE INSERT OR UPDATE ON conversation_participants FOR EACH ROW EXECUTE FUNCTION guard_read_participant();