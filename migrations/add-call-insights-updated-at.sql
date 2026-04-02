-- Align call_insights with upsertCallInsights (column used on INSERT ... ON CONFLICT DO UPDATE).
ALTER TABLE call_insights
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE call_insights
SET updated_at = computed_at
WHERE updated_at IS NULL;
