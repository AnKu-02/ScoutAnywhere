-- Private staging only. No changes to public properties, units or advertisements.
ALTER TABLE advertiser_profiles ADD CONSTRAINT advertiser_profiles_id_user_unique UNIQUE(advertiser_id,user_id);

-- Validate the JSON envelope and category-specific storage types even for direct SQL.
CREATE FUNCTION valid_listing_draft(data jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE section text; pair record; allowed text[]; category text; n numeric;
BEGIN
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR octet_length(data::text)>24576 THEN RETURN false; END IF;
  IF NOT (data ?& ARRAY['category','property','unit','advertisement']) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN ('category','property','unit','advertisement','relationship')) THEN RETURN false; END IF;
  category:=data->>'category';
  IF category IS NULL OR category NOT IN ('flatshares','rent','buy') THEN RETURN false; END IF;
  IF data ? 'relationship' AND (jsonb_typeof(data->'relationship')<>'string' OR data->>'relationship' NOT IN ('owner','broker','tenant')) THEN RETURN false; END IF;
  FOREACH section IN ARRAY ARRAY['property','unit','advertisement'] LOOP
    IF jsonb_typeof(data->section) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF section='property' THEN
      allowed:=ARRAY['city','locality','building','address','pinCode','propertyType','amenities'];
    ELSIF section='unit' THEN
      allowed:=CASE category WHEN 'flatshares' THEN ARRAY['furnishing','bedroom','occupants','houseRules','householdInfo']
        WHEN 'rent' THEN ARRAY['furnishing','bhk','bathrooms','carpetSqft']
        ELSE ARRAY['furnishing','bhk','carpetSqft','propertyAge','projectInfo'] END;
    ELSE
      allowed:=ARRAY['title','description','brokerage','brokerageTerms'] || CASE category
        WHEN 'flatshares' THEN ARRAY['monthlyRent','deposit','maintenance','utilities','utilityTerms','availableFrom']
        WHEN 'rent' THEN ARRAY['monthlyRent','deposit','maintenance','availableFrom'] ELSE ARRAY['askingPrice'] END;
    END IF;
    FOR pair IN SELECT * FROM jsonb_each(data->section) LOOP
      IF NOT pair.key=ANY(allowed) THEN RETURN false; END IF;
      IF pair.key='amenities' THEN
        IF jsonb_typeof(pair.value)<>'array' THEN RETURN false; END IF;
        IF jsonb_array_length(pair.value)>6 OR EXISTS(SELECT 1 FROM jsonb_array_elements(pair.value) v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('Lift','Power backup','Covered parking','Security','Balcony','Water supply')) THEN RETURN false; END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(pair.value))<>(SELECT count(DISTINCT v) FROM jsonb_array_elements(pair.value) v) THEN RETURN false; END IF;
      ELSIF pair.key IN ('occupants','bhk','bathrooms','carpetSqft','propertyAge','monthlyRent','askingPrice','deposit','maintenance','utilities','brokerage') THEN
        IF jsonb_typeof(pair.value)<>'number' THEN RETURN false; END IF;
        n:=(pair.value#>>'{}')::numeric;
        IF n<>trunc(n) OR n<0 OR n>10000000000 THEN RETURN false; END IF;
        IF pair.key IN ('bhk','bathrooms','carpetSqft','monthlyRent','askingPrice') AND n<1 THEN RETURN false; END IF;
        IF (pair.key='bhk' AND n>10) OR (pair.key='bathrooms' AND n>20) OR (pair.key='carpetSqft' AND n>1000000) OR (pair.key='occupants' AND n>50) OR (pair.key='propertyAge' AND n>300) THEN RETURN false; END IF;
      ELSE
        IF jsonb_typeof(pair.value)<>'string' THEN RETURN false; END IF;
        IF length(pair.value#>>'{}')>(CASE pair.key WHEN 'description' THEN 6000 WHEN 'houseRules' THEN 1200 WHEN 'householdInfo' THEN 1200 WHEN 'projectInfo' THEN 1200 WHEN 'city' THEN 100 WHEN 'locality' THEN 120 WHEN 'building' THEN 160 WHEN 'title' THEN 160 ELSE 300 END) THEN RETURN false; END IF;
        IF pair.key='pinCode' AND pair.value#>>'{}' !~ '^[1-9][0-9]{5}$' THEN RETURN false; END IF;
        IF pair.key='propertyType' AND pair.value#>>'{}' NOT IN ('apartment','independent-house') THEN RETURN false; END IF;
        IF pair.key='furnishing' AND pair.value#>>'{}' NOT IN ('furnished','semi-furnished','unfurnished') THEN RETURN false; END IF;
        IF pair.key='bedroom' AND pair.value#>>'{}' NOT IN ('private','shared') THEN RETURN false; END IF;
        IF pair.key='availableFrom' THEN
          IF pair.value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' OR (pair.value#>>'{}')::date NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31' THEN RETURN false; END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE TABLE listing_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  advertiser_id integer NOT NULL,
  FOREIGN KEY(advertiser_id,user_id) REFERENCES advertiser_profiles(advertiser_id,user_id) ON DELETE CASCADE,
  category text NOT NULL CHECK(category IN ('flatshares','rent','buy')),
  content jsonb NOT NULL CHECK(valid_listing_draft(content)),
  CHECK(content->>'category'=category),
  version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_drafts_user_recent_idx ON listing_drafts(user_id,updated_at DESC,id);
CREATE INDEX listing_drafts_advertiser_idx ON listing_drafts(advertiser_id,user_id);

CREATE FUNCTION protect_listing_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.advertiser_id<>OLD.advertiser_id OR NEW.category<>OLD.category THEN
    RAISE EXCEPTION 'Draft relationships and category are immutable';
  END IF;
  NEW.created_at:=OLD.created_at;
  NEW.updated_at:=now();
  NEW.version:=OLD.version+1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER listing_draft_update BEFORE UPDATE ON listing_drafts FOR EACH ROW EXECUTE FUNCTION protect_listing_draft();

-- Retain bounded creation receipts after deletion so a delayed retry cannot recreate a draft.
CREATE TABLE listing_draft_requests (
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  draft_id uuid UNIQUE REFERENCES listing_drafts(id) ON DELETE SET NULL,
  payload_hash text NOT NULL CHECK(length(payload_hash)=64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
CREATE TABLE listing_draft_write_limits (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL CHECK(request_count BETWEEN 1 AND 30)
);