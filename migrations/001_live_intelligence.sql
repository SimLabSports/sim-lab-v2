BEGIN;
CREATE TABLE IF NOT EXISTS expert_picks (
 id text PRIMARY KEY,
 event_id text NOT NULL,
 sport text NOT NULL,
 market text NOT NULL,
 origin_id text NOT NULL,
 published_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 retracted boolean NOT NULL DEFAULT false,
 record jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expert_picks_event_idx ON expert_picks(event_id,sport,market);
CREATE UNIQUE INDEX IF NOT EXISTS expert_original_vote_idx ON expert_picks(event_id,sport,market,origin_id,published_at);
CREATE TABLE IF NOT EXISTS gcm_evaluations (
 id text PRIMARY KEY,
 event_id text NOT NULL,
 sport text NOT NULL,
 market text NOT NULL,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS gcm_event_idx ON gcm_evaluations(event_id,sport,market,created_at DESC);
CREATE TABLE IF NOT EXISTS intelligence_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action text NOT NULL,
 record_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expert_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gcm_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_audit ENABLE ROW LEVEL SECURITY;
-- No client policies: use only the server's private owner/service database role.
-- No demo rows, seeded opinions, or synthetic predictions.
COMMIT;
