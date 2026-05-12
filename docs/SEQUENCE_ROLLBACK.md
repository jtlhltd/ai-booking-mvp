# Outbound sequence rollback (Tom / `d2d-xpress-tom`)

To disable the multi-stage sequence immediately without redeploying:

**Postgres**

```sql
UPDATE tenants
SET outbound_sequence_json = jsonb_set(
  COALESCE(outbound_sequence_json, '{}'::jsonb),
  '{enabled}',
  'false'::jsonb,
  true
)
WHERE client_key = 'd2d-xpress-tom';
```

**SQLite**

```sql
UPDATE tenants
SET outbound_sequence_json = json_set(COALESCE(outbound_sequence_json, '{}'), '$.enabled', json('false'))
WHERE client_key = 'd2d-xpress-tom';
```

**Global kill switch (all tenants)**

Set environment variable `OUTBOUND_SEQUENCE_DISABLED=1` and restart workers.

**Notes on the Tom seed**

- The Tom seed migration only writes when `outbound_sequence_json IS NULL`. The two SQL flips above (Postgres / SQLite) survive restarts.
- To force-reseed the canonical Tom config (e.g. after schema changes), set `RESEED_TOM_OUTBOUND_SEQUENCE=1` and restart. Use rarely — this overwrites any in-place edits.

**PR4.5 operator stop / salvage dismiss rollback**

- If the operator stop or salvage-dismiss UI needs to be disabled quickly, remove or block the new `client-ops` endpoints and the dashboard buttons; existing sequence state and handoff rows continue to render safely.
- If a salvage row was dismissed by mistake, clear `qual._salvageDismissedAt` / `qual._salvageDismissedBy` in `lead_handoff.data_json` for that phone and leave the `_opsAudit` trail intact.
