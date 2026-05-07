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
