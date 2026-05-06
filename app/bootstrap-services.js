import twilio from 'twilio';
import BookingSystem from '../booking-system.js';
import SMSEmailPipeline from '../sms-email-pipeline.js';

/**
 * Initializes optional runtime services that may fail without taking down the process.
 *
 * @param {object} twilioEnv
 * @param {string} twilioEnv.TWILIO_ACCOUNT_SID
 * @param {string} twilioEnv.TWILIO_AUTH_TOKEN
 * @param {string} twilioEnv.TWILIO_FROM_NUMBER
 * @param {string} twilioEnv.TWILIO_MESSAGING_SERVICE_SID
 */
export function bootstrapServices({
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  TWILIO_MESSAGING_SERVICE_SID,
}) {
  let bookingSystem = null;
  try {
    bookingSystem = new BookingSystem();
    console.log('✅ Booking system initialized');
  } catch (error) {
    console.error('❌ Failed to initialize booking system:', error.message);
    console.log('⚠️ Booking functionality will be disabled');
  }

  let smsEmailPipeline = null;
  try {
    smsEmailPipeline = new SMSEmailPipeline(bookingSystem);
    console.log('✅ SMS-Email pipeline initialized');
  } catch (error) {
    console.error('❌ Failed to initialize SMS-Email pipeline:', error.message);
    console.log('⚠️ SMS-Email functionality will be disabled');
  }

  const defaultSmsClient =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
      ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
      : null;
  const defaultSmsConfigured = !!(
    defaultSmsClient && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID)
  );

  return {
    bookingSystem,
    smsEmailPipeline,
    defaultSmsClient,
    defaultSmsConfigured,
  };
}
