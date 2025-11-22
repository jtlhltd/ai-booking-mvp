// SMS Template Library
// Pre-built SMS templates with personalization support

export const SMS_TEMPLATES = {
  booking_confirmation: {
    name: 'Booking Confirmation',
    template: `Hi {name}! Your {service} appointment with {businessName} is confirmed for {date} at {time}. Address: {address}. See you then!`,
    variables: ['name', 'service', 'businessName', 'date', 'time', 'address']
  },
  
  booking_reminder_24h: {
    name: '24-Hour Reminder',
    template: `Hi {name}, just a friendly reminder: Your {service} appointment with {businessName} is tomorrow at {time}. Looking forward to seeing you!`,
    variables: ['name', 'service', 'businessName', 'time']
  },
  
  booking_reminder_2h: {
    name: '2-Hour Reminder',
    template: `Hi {name}, your {service} appointment with {businessName} is in 2 hours at {time}. See you soon!`,
    variables: ['name', 'service', 'businessName', 'time']
  },
  
  no_answer_followup: {
    name: 'No Answer Follow-up',
    template: `Hi {name}, we tried calling about your {service} inquiry with {businessName}. Still interested? Reply YES to book or call {phone}.`,
    variables: ['name', 'service', 'businessName', 'phone']
  },
  
  voicemail_followup: {
    name: 'Voicemail Follow-up',
    template: `Hi {name}, we left you a voicemail about {service} with {businessName}. Reply YES to book or call {phone}.`,
    variables: ['name', 'service', 'businessName', 'phone']
  },
  
  callback_requested: {
    name: 'Callback Requested',
    template: `Hi {name}, thanks for your interest! We'll call you back at {preferredTime} about {service} with {businessName}.`,
    variables: ['name', 'preferredTime', 'service', 'businessName']
  },
  
  time_options: {
    name: 'Time Options',
    template: `Hi {name}, here are available times for {service} with {businessName}: {timeOptions}. Reply with your preferred time!`,
    variables: ['name', 'service', 'businessName', 'timeOptions']
  },
  
  reschedule_request: {
    name: 'Reschedule Request',
    template: `Hi {name}, need to reschedule your {service} appointment with {businessName}? Reply with a new date/time that works for you.`,
    variables: ['name', 'service', 'businessName']
  },
  
  thank_you: {
    name: 'Thank You',
    template: `Hi {name}, thank you for choosing {businessName} for your {service}! We hope you had a great experience. See you next time!`,
    variables: ['name', 'businessName', 'service']
  },
  
  special_offer: {
    name: 'Special Offer',
    template: `Hi {name}, {businessName} has a special offer on {service}: {offerDetails}. Book now: {bookingLink}`,
    variables: ['name', 'businessName', 'service', 'offerDetails', 'bookingLink']
  }
};

/**
 * Render SMS template with variables
 */
export function renderSMSTemplate(templateKey, variables = {}) {
  const template = SMS_TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Template "${templateKey}" not found`);
  }

  let message = template.template;
  
  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    message = message.replace(new RegExp(placeholder, 'g'), value || '');
  }
  
  // Remove any unreplaced placeholders
  message = message.replace(/\{[^}]+\}/g, '');
  
  // Clean up extra spaces
  message = message.replace(/\s+/g, ' ').trim();
  
  return message;
}

/**
 * Get template by name
 */
export function getTemplate(templateKey) {
  return SMS_TEMPLATES[templateKey];
}

/**
 * List all available templates
 */
export function listTemplates() {
  return Object.entries(SMS_TEMPLATES).map(([key, template]) => ({
    key,
    name: template.name,
    variables: template.variables,
    preview: template.template.substring(0, 100) + '...'
  }));
}

/**
 * Validate template variables
 */
export function validateTemplateVariables(templateKey, variables) {
  const template = SMS_TEMPLATES[templateKey];
  if (!template) {
    return { valid: false, error: `Template "${templateKey}" not found` };
  }

  const missing = template.variables.filter(v => !variables[v]);
  const extra = Object.keys(variables).filter(v => !template.variables.includes(v));

  return {
    valid: missing.length === 0,
    missing,
    extra,
    required: template.variables
  };
}

