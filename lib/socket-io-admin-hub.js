/**
 * Admin Hub Socket.IO: CORS allowlist + API key handshake gate.
 */

export function resolveSocketIoAllowedOrigins() {
  const extra = String(process.env.SOCKETIO_EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = [process.env.PUBLIC_BASE_URL, process.env.BASE_URL, ...extra];
  const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (!isProd) {
    candidates.push(
      'http://localhost:10000',
      'http://127.0.0.1:10000',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    );
  }
  const origins = new Set();
  for (const u of candidates) {
    if (!u) continue;
    try {
      origins.add(new URL(u).origin);
    } catch {
      /* skip invalid */
    }
  }
  return Array.from(origins);
}

/**
 * Require `handshake.auth.token` or `x-api-key` header to match `API_KEY` when set.
 * In production, refuse connections if `API_KEY` is unset (misconfiguration).
 */
export function installAdminHubSocketAuth(io) {
  const apiKey = String(process.env.API_KEY || '').trim();
  const isProd = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

  io.use((socket, next) => {
    if (!apiKey) {
      if (isProd) return next(new Error('Admin hub socket: set API_KEY'));
      return next();
    }
    const provided =
      (socket.handshake.auth && String(socket.handshake.auth.token || '').trim()) ||
      String(socket.handshake.headers['x-api-key'] || '').trim();
    if (provided !== apiKey) return next(new Error('Unauthorized'));
    next();
  });
}
