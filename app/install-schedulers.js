export function buildScheduledJobsDeps({
  processCallQueue,
  processRetryQueue,
  queueNewLeadsForCalling,
  sendScheduledReminders,
}) {
  return {
    processCallQueue,
    processRetryQueue,
    queueNewLeadsForCalling,
    sendScheduledReminders,
  };
}

