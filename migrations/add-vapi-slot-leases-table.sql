-- Cross-instance Vapi outbound concurrency: one lease row per in-flight slot (PR-13).
-- Reaped when expires_at passes (crash recovery) or on explicit release (EOCR / abort).

CREATE TABLE IF NOT EXISTS vapi_slot_leases (
  lease_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT UNIQUE,
  instance_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  release_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS vapi_slot_leases_expires_at_idx
  ON vapi_slot_leases (expires_at);

CREATE INDEX IF NOT EXISTS vapi_slot_leases_call_id_idx
  ON vapi_slot_leases (call_id)
  WHERE call_id IS NOT NULL;
