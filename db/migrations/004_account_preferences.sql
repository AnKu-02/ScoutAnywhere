CREATE TABLE account_preferences (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  preferred_city text NOT NULL DEFAULT '' CHECK (length(preferred_city) <= 100),
  seeking boolean NOT NULL DEFAULT true,
  owning boolean NOT NULL DEFAULT false,
  brokering boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Interests above convey no permissions. Privileged capabilities are separate,
-- assigned only through reviewed operator/database processes; no public write API.
CREATE TABLE account_capabilities (
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('administrator','advertiser')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,capability)
);
CREATE INDEX auth_session_expiry_idx ON auth_session("expiresAt");
CREATE INDEX auth_verification_expiry_idx ON auth_verification("expiresAt");
CREATE UNIQUE INDEX auth_account_provider_unique ON auth_account("providerId","accountId");
-- Registration does not reference advertisers/listings, and cannot claim demo data.