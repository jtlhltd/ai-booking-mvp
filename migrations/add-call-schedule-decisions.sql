-- Log when optimal dial scheduling moves a queue slot (Thompson or heuristic vs baseline).
CREATE TABLE IF NOT EXISTS call_schedule_decisions (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  baseline_at TIMESTAMPTZ NOT NULL,
  chosen_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  hour_chosen SMALLINT,
  delay_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_decisions_client_idx ON call_schedule_decisions(client_key, created_at DESC);

CREATE INDEX IF NOT EXISTS bandit_obs_created_idx ON call_time_bandit_observations(client_key, created_at DESC);
