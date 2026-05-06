// Get optimal calling time based on business data
export function getOptimalCallTime(business) {
  // Analyze business name and location for optimal timing
  const name = business.name.toLowerCase();
  const address = business.address?.toLowerCase() || '';
  
  // Dental practices typically best called 9-10 AM or 2-3 PM
  if (name.includes('dental') || name.includes('dentist')) {
    return '09:00-10:00 or 14:00-15:00';
  }
  
  // Law firms prefer morning calls
  if (name.includes('law') || name.includes('legal')) {
    return '09:00-11:00';
  }
  
  // Beauty salons prefer afternoon
  if (name.includes('beauty') || name.includes('salon')) {
    return '14:00-16:00';
  }
  
  // Default optimal times
  return '09:00-10:00 or 14:00-15:00';
}

// Advanced Analytics and Optimization
// moved: /admin/vapi/campaign-analytics/:campaignId → routes/admin-vapi-campaigns-mount.js

// Multi-Channel Follow-up System
// moved: /admin/vapi/follow-up-sequence → routes/admin-vapi-campaigns-mount.js

// Generate follow-up plan based on call outcome
export function generateFollowUpPlan(call) {
  const outcomes = {
    'voicemail': 'Email immediately, retry call in 2 hours',
    'interested': 'Send demo confirmation email and calendar invite',
    'objection': 'Send objection handling email, follow-up call in 3 days',
    'not_interested': 'Send case study email, follow-up call in 1 week',
    'no_answer': 'Retry call at different time, send email',
    'busy': 'Send email, retry call next day'
  };
  
  return outcomes[call.outcome] || 'Standard follow-up sequence';
}

// Generate voicemail follow-up email
export function generateVoicemailFollowUpEmail(call) {
  return {
    subject: `Hi ${call.decisionMaker?.name || 'there'}, following up on my call about our premium £500/month booking service`,
    body: `Hi ${call.decisionMaker?.name || 'there'},

I left you a voicemail earlier about helping ${call.businessName} increase appointment bookings by 300% with our premium £500/month service.

I wanted to follow up with some quick information:

✅ We've helped 500+ dental practices increase bookings
✅ Our AI handles calls 24/7, never misses a patient  
✅ Automatically books appointments in your calendar
✅ Premium service includes dedicated account manager
✅ Most practices see 20-30 extra bookings per month worth £10,000-15,000
✅ ROI typically achieved within 30 days

Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings monthly.

Would you be available for a quick 15-minute demo this week? I can show you exactly how this works and the ROI you can expect.

Best regards,
Sarah
AI Booking Solutions

P.S. If you're not the right person, could you please forward this to the practice owner or manager?`
  };
}

// Generate demo confirmation email
export function generateDemoConfirmationEmail(call) {
  return {
    subject: `Demo confirmed - How to increase ${call.businessName} bookings by 300% with our premium £500/month service`,
    body: `Hi ${call.decisionMaker?.name},

Great speaking with you! I'm excited to show you how we can help ${call.businessName} increase bookings by 300% with our premium £500/month service.

Demo Details:
📅 Date: [To be confirmed]
⏰ Duration: 15 minutes
🎯 Focus: How our premium AI service can handle your patient calls 24/7
💰 Investment: £500/month (typically pays for itself with 2-3 extra bookings)

What you'll see:
• Live demo of our premium AI booking system
• How it integrates with your calendar
• Real results from similar practices (20-30 extra bookings monthly)
• Custom setup for your practice
• Dedicated account manager benefits
• ROI calculations and projections

Our premium service typically generates £10,000-15,000 in additional revenue monthly for practices like yours.

I'll send you a calendar invite shortly. Looking forward to showing you how this can transform your practice!

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Generate objection handling email
export function generateObjectionHandlingEmail(call) {
  return {
    subject: `Addressing your concerns about our premium £500/month AI booking service for ${call.businessName}`,
    body: `Hi ${call.decisionMaker?.name},

I understand your concerns about [objection]. Let me address this directly:

[OBJECTION-SPECIFIC CONTENT]

But here's what I want you to know about our premium £500/month service:
• We've helped 500+ practices overcome these same concerns
• Most practices see ROI within 30 days
• Our premium service pays for itself with just 2-3 extra bookings per month
• Most practices see 20-30 extra bookings worth £10,000-15,000 monthly
• We offer a 30-day money-back guarantee
• Setup takes less than 30 minutes
• Includes dedicated account manager and priority support

The numbers speak for themselves: £500 investment typically generates £10,000-15,000 in additional revenue monthly.

I'd love to show you a quick 15-minute demo to address your specific concerns and show you the ROI calculations. Would you be available this week?

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Dynamic Script Personalization System
// moved: /admin/vapi/personalized-assistant → routes/admin-vapi-campaigns-mount.js

// Generate personalized script based on business data
export function generatePersonalizedScript(business, industry, region) {
  const businessName = business.name;
  const decisionMaker = business.decisionMaker?.name || 'there';
  const location = business.address || business.city || business.region || '';
  const regionHint = region || business.region || location;
  const website = business.website ? `I noticed on ${business.website} that` : '';
  
  const services = Array.isArray(business.services)
    ? business.services
    : typeof business.services === 'string'
      ? business.services.split(',').map(s => s.trim()).filter(Boolean)
      : [];
  const servicesSummary = services.length
    ? services.slice(0, 2).join(' & ')
    : null;
  const primaryService = services.length ? services[0] : 'appointments';
  const bookingLink = business.bookingLink || business.bookingUrl || null;
  
  // Industry-specific personalization
  const industryContext = getIndustryContext(industry);
  
  // Regional personalization
  const regionalContext = getRegionalContext(regionHint || location);

  const introWebsiteLine = website
    ? `${website} you offer ${servicesSummary || primaryService}. `
    : '';
  const serviceHook = servicesSummary
    ? ` enquiries for ${servicesSummary}`
    : ` new enquiries`;
  
  const firstMessage = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. We've helped ${industryContext.examplePractice} in ${regionalContext.city} capture more ${industryContext.metric} automatically. ${introWebsiteLine}Do you have 90 seconds to see how this could handle ${serviceHook} at ${businessName}?`;
  
  const systemMessage = `You are Sarah, calling ${decisionMaker} at ${businessName} in ${regionalContext.city}.

BUSINESS CONTEXT:
- Practice: ${businessName}
- Location: ${location}
- Decision Maker: ${decisionMaker}
- Industry: ${industry}
- Website: ${business.website || 'Not available'}
- Services: ${servicesSummary || primaryService}
- Booking Link: ${bookingLink || 'Not configured'}

INDUSTRY-SPECIFIC INSIGHTS:
${industryContext.insights}

REGIONAL CONTEXT:
${regionalContext.insights}

PERSONALIZATION RULES:
- Use ${decisionMaker}'s name frequently
- Reference ${businessName} specifically
- Mention ${regionalContext.city} when relevant
- Use ${industryContext.language} appropriate for ${industry}
- Reference ${industryContext.painPoints} as pain points
- Use ${regionalContext.examples} as local examples
- Highlight services such as ${servicesSummary || primaryService}
- Offer to text the booking link if interest is shown${bookingLink ? ` (link: ${bookingLink})` : ''}

CONVERSATION FLOW:
1. RAPPORT: "Hi ${decisionMaker}, this is Sarah from AI Booking Solutions"
2. CONTEXT: "We've helped ${industryContext.examplePractice} in ${regionalContext.city} increase ${industryContext.metric} by 300%"
3. PERSONAL: "${servicesSummary ? `I noticed you focus on ${servicesSummary}. ` : ''}Do you have 90 seconds to hear how this could work for ${businessName}?"
4. QUALIFY: "Are you the owner or manager of ${businessName}?"
5. PAIN: "What's your biggest challenge with ${industryContext.metric} at ${businessName}?"
6. VALUE: "We help practices like ${businessName} increase ${industryContext.metric} by 300%"
7. CLOSE: "Would you be available for a 15-minute demo to see how this could work for ${businessName}?${bookingLink ? ` I can also text over the booking link (${bookingLink}) if that's easier.` : ''}"

OBJECTION HANDLING:
- Too expensive: "What's the cost of losing patients at ${businessName}? Our service pays for itself with 2-3 extra bookings per month"
- Too busy: "That's exactly why ${businessName} needs this - it saves you time by handling bookings automatically"
- Not interested: "I understand. Can I send you a case study showing how we helped ${industryContext.examplePractice} increase bookings by 300%?"

RULES:
- Always use ${decisionMaker}'s name
- Always reference ${businessName}
- Keep calls under 3 minutes
- Focus on ${industryContext.painPoints}
- Use ${regionalContext.examples} for social proof`;
  
  return {
    firstMessage,
    systemMessage,
    personalization: {
      businessName,
      decisionMaker,
      industry,
      region: regionalContext.city,
      website: !!business.website
    }
  };
}

// Get industry-specific context
export function getIndustryContext(industry) {
  const normalized = String(industry || '').toLowerCase().replace(/\s+/g, '_');
  
  const contexts = {
    dentist: {
      examplePractice: 'Birmingham Dental Care',
      language: 'professional medical',
      painPoints: 'missed calls, no-shows, scheduling gaps, treatment plan follow-ups',
      insights: 'Dental practices typically lose 4-5 patients monthly from missed calls. Most practices see 15-20 extra bookings per month with our system.',
      metric: 'dental appointments'
    },
    dental_practice: null,
    dental: null,
    orthodontics: {
      examplePractice: 'Leeds Orthodontic Studio',
      language: 'professional medical',
      painPoints: 'consult requests left waiting, financing questions, treatment plan follow-up',
      insights: 'Orthodontic teams often juggle new consults with existing patients. Automating follow-up adds 10-15 new starts per month.',
      metric: 'consultations and treatment starts'
    },
    lawyer: {
      examplePractice: 'Manchester Legal Associates',
      language: 'professional legal',
      painPoints: 'missed consultations, case intake, client communication',
      insights: 'Law firms typically lose 3-4 consultations monthly from missed calls. Most firms see 12-18 extra consultations per month with our system.',
      metric: 'consultations'
    },
    legal: null,
    law_firm: null,
    beauty_salon: {
      examplePractice: 'London Beauty Studio',
      language: 'friendly professional',
      painPoints: 'missed appointments, no-shows, last-minute cancellations',
      insights: 'Beauty salons typically lose 6-8 appointments monthly from missed calls. Most salons see 20-25 extra bookings per month with our system.',
      metric: 'beauty appointments'
    },
    salon: null,
    spa: {
      examplePractice: 'Brighton Wellness Spa',
      language: 'friendly professional',
      painPoints: 'packages not upsold, missed voicemails, therapists double-booked',
      insights: 'Spas recover 15-20 lost bookings per month once follow-up is automated.',
      metric: 'treatments and packages'
    },
    veterinary: {
      examplePractice: 'Northside Veterinary Clinic',
      language: 'warm clinical',
      painPoints: 'emergency enquiries, follow-ups, surgery scheduling',
      insights: 'Vets often miss urgent calls after hours. Our system rebooks 10-15 pet appointments monthly.',
      metric: 'pet appointments'
    },
    vet: null,
    fitness: {
      examplePractice: 'Total Performance PT Studio',
      language: 'energetic professional',
      painPoints: 'trial sign-ups, intro calls, class bookings, no-shows',
      insights: 'Studios see 20-30% more trial conversions when leads get a fast callback.',
      metric: 'fitness consultations and sessions'
    },
    gym: null,
    personal_training: null,
    physiotherapy: {
      examplePractice: 'Manchester Physio Clinic',
      language: 'professional clinical',
      painPoints: 'treatment plan adherence, initial assessments, cancellations',
      insights: 'Physio clinics recover 8-12 treatment bookings monthly with persistent follow-up.',
      metric: 'treatment sessions'
    },
    chiropractic: {
      examplePractice: 'Bristol Chiropractic Centre',
      language: 'professional clinical',
      painPoints: 'initial consults, care plan enrolments, missed voicemails',
      insights: 'Chiropractors close 12-15 extra care plans each month when every lead is called back within 5 minutes.',
      metric: 'consults and care plans'
    },
    accountant: {
      examplePractice: 'Leeds Tax Advisors',
      language: 'trusted advisor',
      painPoints: 'tax season enquiries, consultation scheduling, document collection',
      insights: 'Accountancy firms convert 10-12 extra consultations per month by tightening follow-up during busy seasons.',
      metric: 'consultations'
    },
    accounting: null,
    finance: {
      examplePractice: 'City Financial Planning',
      language: 'trusted advisor',
      painPoints: 'initial discovery calls, onboarding paperwork, follow-ups',
      insights: 'Financial planners close 3-5 additional clients monthly when no new enquiry waits longer than 5 minutes.',
      metric: 'financial consultations'
    },
    medspa: {
      examplePractice: 'Chelsea Aesthetics',
      language: 'luxury professional',
      painPoints: 'cosmetic consults, treatment upsells, membership plans',
      insights: 'Medspas add 12-18 high-ticket procedures monthly when leads get immediate callbacks.',
      metric: 'aesthetic consultations'
    },
    tattoo: {
      examplePractice: 'Ink Lab London',
      language: 'creative professional',
      painPoints: 'design consultations, deposit collection, scheduling',
      insights: 'Studios recover 10+ bookings per month by chasing enquiries automatically.',
      metric: 'tattoo consultations'
    }
  };
  
  const normalizedKey = (() => {
    if (contexts[normalized]) return normalized;
    if (normalized.includes('dent')) return 'dentist';
    if (normalized.includes('law')) return 'lawyer';
    if (normalized.includes('beauty') || normalized.includes('salon')) return 'beauty_salon';
    if (normalized.includes('vet')) return 'veterinary';
    if (normalized.includes('fit') || normalized.includes('gym') || normalized.includes('pt')) return 'fitness';
    if (normalized.includes('physio')) return 'physiotherapy';
    if (normalized.includes('chiro')) return 'chiropractic';
    if (normalized.includes('account')) return 'accountant';
    if (normalized.includes('finance')) return 'finance';
    if (normalized.includes('spa')) return 'spa';
    if (normalized.includes('tattoo') || normalized.includes('ink')) return 'tattoo';
    return 'dentist';
  })();
  
  const selected = contexts[normalizedKey];
  if (selected) {
    return {
      examplePractice: selected.examplePractice,
      language: selected.language,
      painPoints: selected.painPoints,
      insights: selected.insights,
      metric: selected.metric || 'appointments'
    };
  }
  
  return {
    examplePractice: 'Local Practice',
    language: 'professional and friendly',
    painPoints: 'missed calls, slow follow-up, manual scheduling',
    insights: 'Businesses typically lose 5-10 opportunities monthly from slow follow-up. Most see 25% more bookings with our system.',
    metric: 'appointments'
  };
}

// Get regional context
export function getRegionalContext(location) {
  const locationLower = location.toLowerCase();
  
  if (locationLower.includes('london')) {
    return {
      city: 'London',
      insights: 'London practices face high competition and need every advantage. We\'ve helped 50+ London practices increase bookings.',
      examples: 'London Dental Care, Central London Practice'
    };
  } else if (locationLower.includes('manchester')) {
    return {
      city: 'Manchester',
      insights: 'Manchester practices benefit from our system\'s efficiency. We\'ve helped 30+ Manchester practices increase bookings.',
      examples: 'Manchester Dental Group, Northern Practice'
    };
  } else if (locationLower.includes('birmingham')) {
    return {
      city: 'Birmingham',
      insights: 'Birmingham practices see great results with our system. We\'ve helped 25+ Birmingham practices increase bookings.',
      examples: 'Birmingham Dental Care, Midlands Practice'
    };
  } else {
    return {
      city: 'your area',
      insights: 'Practices in your area benefit from our system\'s efficiency. We\'ve helped hundreds of UK practices increase bookings.',
      examples: 'local practices, similar businesses'
    };
  }
}
