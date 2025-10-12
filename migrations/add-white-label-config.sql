-- White-Label Configuration

-- Add white_label_config column to tenants table
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='tenants' AND column_name='white_label_config'
  ) THEN
    ALTER TABLE tenants ADD COLUMN white_label_config JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenants_white_label_config ON tenants USING gin(white_label_config);

-- Example white_label_config structure:
/*
{
  "branding": {
    "companyName": "Your Company",
    "logo": "/uploads/branding/logo.png",
    "favicon": "/uploads/branding/favicon.png",
    "primaryColor": "#667eea",
    "secondaryColor": "#764ba2",
    "accentColor": "#10b981",
    "fontFamily": "Inter, sans-serif"
  },
  "domain": {
    "custom": "booking.yourcompany.com",
    "subdomain": "yourcompany"
  },
  "email": {
    "fromName": "Your Company",
    "fromEmail": "noreply@yourcompany.com",
    "replyTo": "support@yourcompany.com",
    "signature": "Best regards,\nYour Company Team"
  },
  "sms": {
    "senderName": "YourCo",
    "shortCode": null
  },
  "features": {
    "showPoweredBy": false,
    "customFooter": "© 2025 Your Company",
    "customCss": null
  }
}
*/

