# Test suite status (historical notes)

This file used to track a set of failing tests. **Those failures are now resolved** and the CI-equivalent command is expected to be green:

- `npm run test:ci`

If you see failures again, treat this as an **incident log template** (add the failing test file, the observed error, and the fix or PR that addressed it).

## If `npm run test:ci` fails before tests start (Windows)

The most common cause is a Node/toolchain mismatch for the native dependency `better-sqlite3`.

- **Recommended**: use **Node 20** (see `.nvmrc` / `package.json` `volta.node`)
- If you use Node 22+, you may need **Visual Studio Build Tools 2022** (“Desktop development with C++”)

See `docs/TESTING.md` for the canonical setup notes.

