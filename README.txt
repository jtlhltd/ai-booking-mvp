server.notify-fixed.js — what’s inside
--------------------------------------
- Fixes the 'ReferenceError: out is not defined' by keeping all returns inside the route.
- Proper branding fallback: displayName → X-Client-Key → clientKey → 'Our Clinic'.
- Tenant-aware sender: prefers tenant.sms.messagingServiceSid/fromNumber; falls back to env defaults.
- Idempotency support via Idempotency-Key header.
- Clean 4xx vs 5xx responses with detailed error logging.

Quick use
---------
1) Install deps:
   npm i express helmet morgan cors twilio uuid

2) Run locally:
   setx AUTH_API_KEYS your-shared-key
   setx TWILIO_ACCOUNT_SID AC... && setx TWILIO_AUTH_TOKEN ...
   # optional defaults if tenant lacks sms config:
   setx TWILIO_MESSAGING_SERVICE_SID MG...  OR  setx TWILIO_FROM +447...
   node server.notify-fixed.js

3) Seed tenant (PowerShell):
   $h = @{ 'X-API-Key'='your-shared-key'; 'Content-Type'='application/json' }
   $body = @'
   {
     "clientKey": "victory_dental",
     "displayName": "Victory Dental Clinic",
     "booking": { "timezone": "Europe/London", "defaultDurationMin": 30 },
     "sms": { "messagingServiceSid": "MG852f3cf7b50ef1be50c566be9e7efa04" }
   }
   '@
   Invoke-RestMethod -Uri "http://localhost:10000/api/clients" -Method Post -Headers $h -Body $body

4) Send test:
   $h = @{
     'X-API-Key'    = 'your-shared-key'
     'X-Client-Key' = 'victory_dental'
     'Content-Type' = 'application/json'
   }
   $body = @'
   {
     "channel": "sms",
     "to": "+447491683261",
     "message": "Server test — Victory Dental Clinic. Reply STOP to opt out."
   }
   '@
   Invoke-RestMethod -Uri "http://localhost:10000/api/notify/send" -Method Post -Headers $h -Body $body

Render tips
-----------
- Start command: node server.notify-fixed.js
- Health check path: /health
- Make sure AUTH_API_KEYS and Twilio envs are set.
