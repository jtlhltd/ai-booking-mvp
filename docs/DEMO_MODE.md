# Demo Mode Guide

Demo mode keeps Loom walkthroughs deterministic by fixing the booking script and capturing telemetry you can narrate over.

## Enabling Demo Mode

- Set `DEMO_MODE=true` in Render (or your env file).
- Optional overrides:
  - `DEMO_SCRIPT_PATH` – alternate path to the script JSON.
  - `DEMO_TELEMETRY_PATH` – alternate path for the telemetry log (defaults to `data/demo-telemetry.log`).

Restart the service after changing the flag.

## Scripted Booking Overrides

The configuration lives at `config/demo-script.json`. Each scenario contains:

```json
{
  "match": {
    "tenant": "test_client",
    "leadPhone": "+447491683261",
    "service": "Swedish Massage"
  },
  "overrides": {
    "slot": {
      "weekday": "friday",
      "time": "16:00",
      "weekOffset": 1
    },
    "sms": {
      "message": "Booking confirmed: {{service}}, {{day}} {{date}} at {{time}}...",
      "skip": false
    }
  }
}
```

### Authoring Rules

- `slot` can accept:
  - `iso`: exact ISO timestamp (in business tz).
  - `weekday` + `time` (+ optional `weekOffset`, `dayOffset`, `minuteOffset`).
  - `offsetMinutes`: relative to “now”.
- `sms.message` uses the existing template renderer (`{{name}}`, `{{service}}`, `{{day}}`, `{{date}}`, `{{time}}`, `{{duration}}`, `{{when}}`, `{{tz}}`, `{{link}}`, `{{sig}}`).
- Set `sms.skip = true` to suppress the confirmation text during a demo.

Overrides only apply when demo mode is enabled. Outside of demo mode the script is ignored.

## Telemetry

When `DEMO_MODE=true` each booking produces a JSON line in `data/demo-telemetry.log`:

```json
{
  "evt": "booking.checkAndBook",
  "tenant": "test_client",
  "service": "Swedish Massage",
  "slot": { "finalIso": "2025-11-14T16:00:00Z" },
  "overrides": { "scenarioId": "oak-spa-primary", ... },
  "google": { "status": "confirmed" },
  "sms": { "id": "SM...", "override": true },
  "elapsedMs": 1275
}
```

Use it to overlay structured narration in Loom (e.g., “here’s the scenario id we forced”).

## Admin Endpoints

All endpoints are GET unless noted:

| Endpoint | Description |
| --- | --- |
| `/admin/demo-script` | Returns the parsed script JSON plus whether demo mode is active. |
| `/admin/demo-telemetry?limit=50` | Latest telemetry rows (default 100). |
| `DELETE /admin/demo-telemetry` | Clears the telemetry log (handy between takes). |

Each admin endpoint returns `{ ok: true, ... }` on success or `{ ok: false, error }` on failure.

## Demo Workflow Checklist

1. Ensure `DEMO_MODE=true` and the script JSON matches your storyline.
2. Call `/admin/demo-script` to verify the overrides.
3. Record the Loom call; after each take, hit `/admin/demo-telemetry` to grab the structured log.
4. Run `DELETE /admin/demo-telemetry` when you need a clean slate.

That’s it—your demo assistant now stays perfectly on script while giving you reliable telemetry for the recording narrative.






