-- Fix Render Database Issues
-- Run this in Render's PostgreSQL dashboard

-- 1. Create opt_out_list table
CREATE TABLE IF NOT EXISTS opt_out_list (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  opted_out_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  source TEXT
);

-- 2. Create demo_client if it doesn't exist
INSERT INTO clients (client_key, business_name, industry, active, created_at)
VALUES ('demo_client', 'Demo Client', 'general', true, NOW())
ON CONFLICT (client_key) DO NOTHING;

-- 3. Create test-client if it doesn't exist
INSERT INTO clients (client_key, business_name, industry, active, created_at)
VALUES ('test-client', 'Test Client', 'general', true, NOW())
ON CONFLICT (client_key) DO NOTHING;

-- Verify
SELECT * FROM clients WHERE client_key IN ('demo_client', 'test-client');

