# Harness scripts (manual / operator checks)

This folder is for **manual / real-world harness checks**. These scripts are **not run by Jest or CI**.

## What belongs here
- Scripts that call `process.exit()` or depend on real environment credentials
- Scripts that hit a running server (local or Render) via HTTP
- Operator workflows (sanity checks, smoke runs, “does the wiring work” flows)

## What does not belong here
- Jest unit tests: `tests/unit/**/*.test.js`
- Jest contract tests: `tests/routes/**/*.contract.test.js`, `tests/db/**/*.contract.test.js`

## Jest/CI commands (source of truth)
- `npm run test:unit`
- `npm run test:integration-lite`
- `npm run test:coverage`
- `npm run test:ci`

