# Archived legacy public pages

This folder contains legacy HTML pages that previously lived under `public/` and were served directly by `express.static('public')`.

They were **not referenced by** `routes/static-pages.js` (the canonical list of named page routes), so keeping them in `public/` made the repo noisy and made it hard to tell what was actually in use.

## How to restore a page

If you discover you still need one of these pages:

1. Move it back to `public/` (same filename), or\n+2. Add an explicit route for it in `routes/static-pages.js`.

Then run the fast gates:\n+- `npm run check:policy`\n+- `npm run test:route-inventory`\n+- `npm run test:server-inline-inventory`\n+- `npm run test:canaries`\n+
## What stayed in `public/`

Pages explicitly referenced by `routes/static-pages.js` remain in `public/` (to preserve fallback behavior when Vite build output is missing).

