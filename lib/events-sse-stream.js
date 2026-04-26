const DEFAULT_SSE_POLL_INTERVAL_MS = 4000;
const DEFAULT_SSE_HEARTBEAT_MS = 15000;

/**
 * GET /api/events/:clientKey — SSE activity stream (extracted from server.js).
 */
export async function handleEventsSseStream(req, res, deps) {
  const {
    query,
    getFullClient,
    activityFeedChannelLabel,
    outcomeToFriendlyLabel,
    isCallQueueStartFailureRow,
    parseCallsRowMetadata,
    formatCallDuration,
    truncateActivityFeedText,
    mapCallStatus,
    mapStatusClass,
    ssePollIntervalMs = DEFAULT_SSE_POLL_INTERVAL_MS,
    sseHeartbeatMs = DEFAULT_SSE_HEARTBEAT_MS
  } = deps || {};

  const { clientKey } = req.params;
  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();

  let isClosed = false;
  let lastSent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let activityChannel = 'AI call';
  try {
    const streamClient = await getFullClient(clientKey);
    activityChannel = activityFeedChannelLabel(streamClient);
  } catch {
    /* default AI call */
  }

  const sendRecentCalls = async () => {
    if (isClosed) return;
    try {
      const recentCallRows = await query(
        `
        SELECT c.call_id, c.id, c.lead_phone, c.status, c.outcome, c.created_at, c.duration, c.recording_url,
               c.transcript, c.retry_attempt, c.metadata,
               l.name, l.service
        FROM (
          SELECT id, call_id, client_key, lead_phone, status, outcome, created_at, duration, recording_url,
                 LEFT(COALESCE(transcript, ''), 512) AS transcript,
                 retry_attempt,
                 CASE WHEN metadata IS NULL THEN NULL
                   ELSE COALESCE(
                     jsonb_strip_nulls(jsonb_build_object(
                       'fromQueue', metadata->'fromQueue',
                       'reason',
                         CASE
                           WHEN jsonb_typeof(metadata->'reason') = 'string'
                           THEN to_jsonb(LEFT(metadata->>'reason', 400))
                           ELSE metadata->'reason'
                         END,
                       'abExperiment', metadata->'abExperiment',
                       'abVariant', metadata->'abVariant',
                       'abOutbound', metadata->'abOutbound'
                     )),
                     '{}'::jsonb
                   )
                 END AS metadata
          FROM calls
          WHERE client_key = $1
            AND created_at > $2
          ORDER BY created_at ASC
          LIMIT 10
        ) c
        LEFT JOIN leads l ON l.client_key = c.client_key AND l.phone = c.lead_phone
        ORDER BY c.created_at ASC
      `,
        [clientKey, lastSent]
      );

      for (const row of recentCallRows.rows || []) {
        lastSent = row.created_at;
        let friendly = outcomeToFriendlyLabel(row.outcome);
        if (isCallQueueStartFailureRow(row)) friendly = 'Could not start call';
        const metaObj = parseCallsRowMetadata(row?.metadata) || {};
        const queueFailReasonRaw =
          typeof metaObj.reason === 'string' ? metaObj.reason : metaObj.reason != null ? String(metaObj.reason) : '';
        const queueFailReason =
          queueFailReasonRaw && queueFailReasonRaw.length > 180
            ? `${queueFailReasonRaw.slice(0, 180).trim()}…`
            : queueFailReasonRaw;
        const durationLabel = formatCallDuration(row.duration);
        const summary =
          isCallQueueStartFailureRow(row) && queueFailReason
            ? `Could not start call — ${queueFailReason}`
            : row.outcome
              ? durationLabel
                ? `${friendly || row.outcome} • ${durationLabel}`
                : friendly || `Outcome: ${row.outcome}`
              : durationLabel
                ? `Call ended • ${durationLabel}`
                : 'Call completed';
        const transcriptPreview = truncateActivityFeedText(row.transcript);
        const retryAttempt = row.retry_attempt != null ? Math.max(0, parseInt(row.retry_attempt, 10) || 0) : 0;
        const payload = {
          id: row.call_id || row.id,
          callId: row.call_id,
          dbId: row.id,
          name: row.name || row.lead_phone,
          leadPhone: row.lead_phone && String(row.lead_phone).trim() ? String(row.lead_phone).trim() : null,
          service: row.service || 'Lead Follow-Up',
          channel: activityChannel,
          summary,
          status: mapCallStatus(row.status),
          statusClass: mapStatusClass(row.status),
          rawStatus: row.status || null,
          timestamp: row.created_at,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          outcome: row.outcome || null,
          outcomeLabel: friendly || null,
          duration: row.duration != null ? row.duration : null,
          durationLabel: durationLabel || null,
          recordingUrl:
            row.recording_url && String(row.recording_url).trim() ? String(row.recording_url).trim() : null,
          transcriptPreview: transcriptPreview || null,
          endedReason: null,
          queueStartFailureReason: isCallQueueStartFailureRow(row) ? queueFailReason || null : null,
          retryAttempt,
          hasRecording: !!(row.recording_url && String(row.recording_url).trim())
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (error) {
      console.error('[EVENT STREAM ERROR]', error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'stream_error' })}\n\n`);
    }
  };

  const interval = setInterval(sendRecentCalls, ssePollIntervalMs);
  const heartbeat = setInterval(() => {
    if (isClosed) return;
    res.write('event: ping\ndata: {}\n\n');
  }, sseHeartbeatMs);

  const closeStream = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    res.end();
  };

  req.on('close', closeStream);
  req.on('end', closeStream);
  sendRecentCalls();
}
