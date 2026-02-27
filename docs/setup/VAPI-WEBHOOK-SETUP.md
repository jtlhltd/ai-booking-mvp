# VAPI Webhook Setup (End-of-Call Reports)

So the dashboard shows **call outcomes** (Picked up, No answer, Voicemail, etc.), VAPI must send **end-of-call** data to our server.

## What we do in code

1. **Every outbound call** (from the call queue and demo test call) includes:
   - `server: { url: "https://your-app.onrender.com/webhooks/vapi" }`
   - `serverMessages: ["end-of-call-report", "status-update", "transcript", "hang"]`
   So VAPI knows where to POST when the call ends.

2. **Webhook handler** (`/webhooks/vapi`):
   - Reads VAPI’s `endedReason` and maps it to our `outcome` (no-answer, voicemail, completed, etc.).
   - If the webhook has no metadata (e.g. end-of-call only), we look up the call by `call_id` in the DB and use that client/lead for the update.

## What you need to configure

1. **Environment**
   - Set `PUBLIC_BASE_URL` (or `RENDER_EXTERNAL_URL`) to your public app URL, e.g. `https://ai-booking-mvp.onrender.com`, so the `server.url` we send to VAPI is correct.

2. **VAPI Dashboard (if you create assistants there)**
   - In the assistant’s **Server URL** (or equivalent), set: `https://your-app.onrender.com/webhooks/vapi`.
   - Ensure the assistant is allowed to send **end-of-call-report** (our create-call payload already requests it per call).

3. **Optional: webhook secret**
   - If you set `VAPI_WEBHOOK_SECRET`, VAPI must send the same secret in the **X-Vapi-Signature** header for all webhooks to this URL. Configure that in the VAPI project/dashboard if you use signing.

## Verifying

- After a call ends, the dashboard should update within a short time with outcome (e.g. “No answer”, “Picked up”) and “Picked up” / “No answer” pill.
- If it stays “Result not received”, VAPI is likely not POSTing to our URL: check Render logs for `[VAPI WEBHOOK]` and that `PUBLIC_BASE_URL` matches your live URL.
