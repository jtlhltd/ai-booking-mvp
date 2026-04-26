import express from 'express';
import { handleMockCallRoute } from '../lib/mock-call-route.js';
import { handleOutboundQueueDayRoute } from '../lib/outbound-queue-day-route.js';
import { handleEventsSseStream } from '../lib/events-sse-stream.js';

/**
 * Public read routes previously inline in server.js (mock-call, queue drilldown, events SSE).
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

  router.get('/mock-call', (req, res) =>
    handleMockCallRoute(req, res, { nanoid, fetchImpl: mockCallFetchImpl })
  );

  router.get('/api/outbound-queue-day/:clientKey', (req, res) =>
    handleOutboundQueueDayRoute(req, res, { getFullClient, isPostgres, query })
  );

  router.get('/api/events/:clientKey', (req, res) => handleEventsSseStream(req, res, eventsSseDeps));

  return router;
}
