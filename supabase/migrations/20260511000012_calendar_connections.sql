-- Calendar OAuth connections (Phase 5A Interview Scheduling Day 2)
--
-- One row per (auth user × provider). Stores the OAuth tokens needed to
-- push calendar events from the booked-interview flow. Tokens are stored
-- as plaintext but the table is service-role-only via RLS — the client
-- never sees a token because all reads/writes happen in server actions
-- using the service-role key. UI surfaces a redacted status row only.
--
-- Connection email is stored separately from the auth user's email so
-- we can correctly show "Connected as cam@personal.com" even when the
-- user signed up under cam@work.com.

CREATE TYPE calendar_provider AS ENUM ('google', 'microsoft');

CREATE TABLE calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider calendar_provider NOT NULL,
  -- The email the user is authenticated as on the provider side.
  -- Display-only; not used as a join key.
  connected_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  -- Absolute expiry, computed from provider response (now() + expires_in).
  expires_at timestamptz NOT NULL,
  -- The scopes the user actually granted (may be a subset of requested).
  scopes text[] NOT NULL DEFAULT '{}',
  -- Provider-specific extras (e.g. Microsoft tenant_id, Google account_id).
  -- Free-form for forward compatibility without schema churn.
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One active connection per user per provider. If the user reconnects,
  -- we UPSERT on this constraint and rotate tokens in place.
  UNIQUE (auth_user_id, provider)
);

CREATE INDEX idx_calendar_connections_user ON calendar_connections (auth_user_id);
CREATE INDEX idx_calendar_connections_expires_at ON calendar_connections (expires_at);

-- updated_at touchup
CREATE OR REPLACE FUNCTION calendar_connections_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION calendar_connections_touch_updated_at();

-- RLS: tokens are sensitive. Default-deny everything from the client.
-- All real reads/writes happen via the service-role key in server actions.
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

-- The only client-visible operation: a user can see whether THEIR OWN
-- connection exists. We still don't expose tokens — UI queries select
-- (id, provider, connected_email, expires_at, created_at) only and the
-- column-level grant model below blocks token reads from anon/authenticated.
CREATE POLICY "users can see their own connections"
  ON calendar_connections
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Block direct INSERT/UPDATE/DELETE from authenticated. All mutations go
-- through the service role (signed in via server action). No policy =
-- default deny under RLS.

-- Column-level grants: revoke token columns from authenticated so even
-- a SELECT * doesn't leak tokens to a misconfigured client query.
REVOKE ALL ON calendar_connections FROM authenticated;
GRANT SELECT (id, auth_user_id, provider, connected_email, expires_at, scopes, created_at, updated_at)
  ON calendar_connections TO authenticated;

-- Track which booking pushed which event, so we can update/cancel later
-- when reschedules ship.
CREATE TABLE interview_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES interview_bookings(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider calendar_provider NOT NULL,
  -- The provider's own event ID (Google: event.id, Microsoft: event.id)
  provider_event_id text NOT NULL,
  -- For Google Meet / Teams: the join URL we got back. Stored so we can
  -- show it in our own UI without re-fetching from the provider.
  meeting_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, auth_user_id, provider)
);

CREATE INDEX idx_interview_calendar_events_booking ON interview_calendar_events (booking_id);
CREATE INDEX idx_interview_calendar_events_user ON interview_calendar_events (auth_user_id);

ALTER TABLE interview_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see their own pushed events"
  ON interview_calendar_events
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Also let employer team members on the same DSO see events tied to
-- bookings on their jobs (so a hiring manager can see the recruiter
-- successfully pushed the event).
CREATE POLICY "dso team sees events for their bookings"
  ON interview_calendar_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM interview_bookings ib
      JOIN interview_proposals ip ON ip.id = ib.proposal_id
      JOIN applications a ON a.id = ip.application_id
      JOIN jobs j ON j.id = a.job_id
      JOIN dso_users du ON du.dso_id = j.dso_id
      WHERE ib.id = interview_calendar_events.booking_id
        AND du.auth_user_id = auth.uid()
    )
  );

REVOKE ALL ON interview_calendar_events FROM authenticated;
GRANT SELECT ON interview_calendar_events TO authenticated;
