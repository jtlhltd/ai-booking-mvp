-- Fix failed_q catch-up slow query (151s+ alerts from query-performance-tracker).
-- Run on existing production DBs; also applied on deploy via migratePostgresCallsLeadPhoneMatchKey().
--
-- Query rewrite in lib/server-queue-workers.js uses COALESCE(lead_phone_match_key, '__nodigits__')
-- instead of per-row regexp_replace on lead_phone.

CREATE INDEX IF NOT EXISTS calls_failed_q_client_dial_match_key_created_desc_idx
  ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
  WHERE call_id LIKE 'failed_q%';

CREATE INDEX IF NOT EXISTS calls_client_dial_match_key_success_created_desc_idx
  ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
  WHERE call_id NOT LIKE 'failed_q%';

CREATE INDEX IF NOT EXISTS calls_failed_q_created_client_idx
  ON calls (created_at DESC, client_key)
  WHERE call_id LIKE 'failed_q%';
