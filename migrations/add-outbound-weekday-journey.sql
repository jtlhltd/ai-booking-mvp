-- Mon–Fri outbound journey: one attempt per weekday bucket per number; terminal on live pickup or all five buckets used.
CREATE TABLE IF NOT EXISTS outbound_weekday_journey (
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  phone_match_key TEXT NOT NULL,
  weekday_mask SMALLINT NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closed_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (client_key, phone_match_key)
);
CREATE INDEX IF NOT EXISTS outbound_weekday_journey_client_idx
  ON outbound_weekday_journey (client_key);
CREATE INDEX IF NOT EXISTS outbound_weekday_journey_closed_idx
  ON outbound_weekday_journey (client_key)
  WHERE closed_at IS NOT NULL;
