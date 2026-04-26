import express from 'express';
import { handleMockCallRoute } from '../lib/mock-call-route.js';
import { handleOutboundQueueDayRoute } from '../lib/outbound-queue-day-route.js';
import { handleEventsSseStream } from '../lib/events-sse-stream.js';
import { publicDevRoutesMiddleware } from '../lib/public-dev-routes-gate.js';

/**
 * Dev / operator read routes (mock-call, queue drilldown, events SSE).
 * Require ENABLE_PUBLIC_DEV_ROUTES=1|true|yes; in production also X-API-Key when API_KEY is set.
 */
export function createPublicReadsRouter(deps) {
  const {
    nanoid,
    mockCallFetchImpl,
    getFullClient,
    isPostgres,
    query,
    eventsSseDeps
  } = deps || {};

  const router = express.Router();
  const gate = publicDevRoutesMiddleware();

  router.get('/mock-call', gate, (req, res) =>
    handleMockCallRoute(req, res, { nanoid, fetchImpl: mockCallFetchImpl })
  );

  router.get('/api/outbound-queue-day/:clientKey', gate, (req, res) =>
    handleOutboundQueueDayRoute(req, res, { getFullClient, isPostgres, query })
  );

  router.get('/api/events/:clientKey', gate, (req, res) => handleEventsSseStream(req, res, eventsSseDeps));

  return router;
}
