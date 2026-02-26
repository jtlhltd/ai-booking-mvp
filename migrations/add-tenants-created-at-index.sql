-- Fix slow listFullClients() query: add index for ORDER BY created_at DESC
-- Run this on existing production DBs to stop "Critical slow query" alerts.
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at DESC);
