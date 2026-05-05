## PR plan: Lock down `routes/tools-mount.js` (sheet tool + callback tool)

### Why
`routes/tools-mount.js` currently accepts tool calls and logs full request bodies. As written, it can:
- allow unauthorized writes to Google Sheets (integrity risk)
- leak PII via logs
- accept a user-controlled `tenantKey` and fall back to a default tenant if resolution fails

This is a high-risk public surface if the route is internet-accessible.

### Scope
- **Code**: `routes/tools-mount.js`, `middleware/vapi-webhook-verification.js` (reuse), possibly `scripts/check-policy.mjs` (new gate)
- **Tests**: `tests/routes/tools-mount.contract.test.js`
- **Intent/enforcement**:
  - Add a new intent row (recommended): `tools.require-auth-or-provider-signature`.\n
  - Enforce via contract tests + policy rule (forbid tool routes without auth middleware).

### Proposed changes (recommended approach)

1) **Require authentication for tool endpoints**
Support both operational modes:\n
- **Provider-signed mode**: if tools are invoked by Vapi, require `verifyVapiSignature` (same requirement as `/webhooks/vapi`).\n
- **Operator mode**: allow `X-API-Key` for manual/admin usage (authenticated), but still enforce tenant isolation.

2) **Remove default-tenant fallback**
- If the tenant cannot be resolved, return 404/400 and alert the operator.\n
- Never write to a “default” tenant sheet on untrusted input.

3) **Stop logging full request bodies**
- Replace `console.log(JSON.stringify(req.body))` with a redacted/summary log:\n
  - tool name, tenant resolution outcome, payload size, and callId/toolCallId if present.\n
  - redact phone/email fields.

### Acceptance criteria
- Unauthenticated POST to `/tools/access_google_sheet` returns **401/403**.\n
- A request with a valid provider signature succeeds.\n
- A request with `X-API-Key` succeeds only when it targets the authorized tenant.\n
- No “fallback to default tenant” behavior exists.

### Tests / gates to add
- Extend `tests/routes/tools-mount.contract.test.js`:\n
  - missing auth/signature → reject\n
  - invalid signature → reject\n
  - valid signature → ok\n
  - `X-API-Key` + tenant mismatch → 403
- Add a policy rule in `scripts/check-policy.mjs`:\n
  - any route under `routes/` containing `/tools/` endpoints must include either `verifyVapiSignature` or `authenticateApiKey`.

### Rollout / verification
- Coordinate with the Vapi tool-call configuration to ensure signatures are sent.\n
- After deploy, verify sheet writes only occur for signed/authenticated requests.

