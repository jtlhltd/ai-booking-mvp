const gcal = require('../gcal');

exports.getTop3 = async ({ tenant, service }) => {
  const duration = tenant.serviceMap?.[service]?.durationMin || 30;
  const slots = await gcal.findSlots({
    calendarId: tenant.calendarId,
    durationMin: duration,
    timezone: tenant.timezone || process.env.DEFAULT_TZ || 'Europe/London'
  });
  return slots.slice(0, 3);
};
