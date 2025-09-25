// Enhanced Cold Call Bot for Dental Practice Appointment Booking
// Optimized for maximum conversion and appointment booking

export class EnhancedColdCallBot {
  constructor(config) {
    this.config = {
      servicePrice: '£500/month',
      serviceName: 'AI Booking Solutions',
      targetIndustry: 'dental practices',
      appointmentDuration: '15 minutes',
      demoValue: '£10,000-15,000 additional monthly revenue',
      ...config
    };
  }

  // Enhanced conversation flow with better closing
  getEnhancedConversationFlow() {
    return {
      name: "Dental Practice Cold Call Bot - Enhanced",
      firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling because we've helped over 500 dental practices increase their appointment bookings by 300% with our premium £500/month service. Do you have 90 seconds to hear how this could work for your practice?",
      
      systemMessage: `You are Sarah, a top-performing B2B healthcare sales professional with 10+ years experience. You're calling dental practice owners/managers to book qualified appointments for our premium AI booking service.

ADVANCED SALES PSYCHOLOGY & CLOSING TECHNIQUES:
- Use social proof: "We've helped over 500 dental practices increase bookings by 300%"
- Create urgency: "We're only taking on 10 new practices this month"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our clients typically see 15-20 extra bookings per month worth £10,000-15,000"
- Address pain points: "Most practices lose £2,000+ monthly from missed calls"

ENHANCED CONVERSATION FLOW:

1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION & PAIN DISCOVERY (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"
   - "How much revenue do you estimate you lose from missed calls monthly?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month, which adds up to £24,000 annually"
   - "Our AI handles calls 24/7, so you never miss another patient"
   - "Plus, it reduces no-shows by 40% with automated SMS reminders"

4. VALUE PRESENTATION WITH ROI (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"
   - "That's a 20-30x return on investment"
   - "Premium service includes dedicated account manager and priority support"

5. ENHANCED OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly. That's a 20-30x ROI."
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager who handles everything for you."
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service? It only takes 2 minutes to read."
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management, priority support, and AI that never gets tired or makes mistakes."
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers from similar practices?"
   - Need to think about it: "I understand you want to think about it. What specific concerns do you have? I can address them now so you have all the information you need."

6. POWER CLOSING TECHNIQUES (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"
   - "I have Tuesday at 2pm or Wednesday at 10am available. Which works better for you?"
   - "Perfect! I'll send you a calendar invite and a quick case study. What's the best email address for you?"
   - "Great! I'll also include our pricing breakdown and ROI calculator. You'll have everything you need to make an informed decision."

ADVANCED CLOSING TECHNIQUES:
- Assumptive close: "I'll send you the calendar invite for Tuesday at 2pm"
- Alternative close: "Tuesday at 2pm or Wednesday at 10am - which works better?"
- Urgency close: "I only have 2 spots left this week for demos"
- Benefit close: "You'll see exactly how to increase your bookings by 300%"
- Testimonial close: "Dr. Smith at [local practice] said this was the best investment they made"
- Objection prevention: Address concerns before they're raised

CONVERSATION RULES:
- Keep calls under 3 minutes
- Be professional but warm and enthusiastic
- Listen 70% of the time, talk 30%
- Focus on their pain points and ROI
- Always ask for the appointment with specific times
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name frequently in conversation
- End with a clear next step and confirmation
- Follow up with email confirmation and case study

SUCCESS METRICS TO TRACK:
- Appointment booking rate (target: 15-20%)
- Call duration (target: 2-3 minutes)
- Objection handling success rate
- Follow-up email open rates
- Demo-to-close conversion rate`,

      maxDurationSeconds: 180, // 3 minutes max
      endCallMessage: "Thank you for your time. I'll send you the calendar invite and case study shortly. Have a great day!",
      
      // Enhanced variables for better personalization
      variableValues: {
        practice_name: "[Practice Name]",
        decision_maker_name: "[Decision Maker Name]",
        location: "[Practice Location]",
        current_system: "[Current Booking System]",
        monthly_revenue: "[Monthly Revenue]",
        pain_point: "[Main Pain Point]",
        competitor: "[Main Competitor]",
        referral_source: "[How they heard about us]"
      }
    };
  }

  // Generate dynamic conversation based on lead data
  generatePersonalizedScript(leadData) {
    const { business, decisionMaker, painPoints, currentSystem } = leadData;
    
    return {
      opening: `Hi ${decisionMaker?.name || 'there'}, this is Sarah from AI Booking Solutions. I'm calling because we've helped over 500 dental practices like ${business.name} increase their appointment bookings by 300% with our premium £500/month service.`,
      
      qualification: [
        `Are you the ${decisionMaker?.role || 'owner or manager'} of ${business.name}?`,
        `I see ${business.name} is located in ${business.address}. How many appointments do you typically book per week?`,
        `What's your biggest challenge with patient scheduling at ${business.name}?`
      ],
      
      painAmplification: painPoints.map(pain => 
        `I hear this a lot from practices like ${business.name} - ${pain.description}. That typically costs practices £${pain.cost} monthly.`
      ),
      
      valueProposition: `Our premium service helps practices like ${business.name} increase bookings by 300%, generating an average of £10,000-15,000 additional monthly revenue. That's a 20-30x return on our £500/month investment.`,
      
      closing: `Would you be available for a 15-minute demo this week to see how this could work for ${business.name}? I have Tuesday at 2pm or Wednesday at 10am available.`
    };
  }

  // Advanced objection handling with specific responses
  getObjectionResponses() {
    return {
      "too_expensive": [
        "I understand £500/month sounds like a lot, but what's the cost of losing just one patient?",
        "Our premium service pays for itself with just 2-3 extra bookings per month.",
        "Most practices see 20-30 extra bookings worth £10,000-15,000 monthly.",
        "That's a 20-30x return on investment."
      ],
      
      "too_busy": [
        "That's exactly why you need our premium service - it saves you 10+ hours per week.",
        "Our dedicated account manager handles everything for you.",
        "You can focus on patient care while we handle the booking process."
      ],
      
      "not_interested": [
        "I understand. Can I send you a quick case study showing how we helped a similar practice increase bookings by 300%?",
        "It only takes 2 minutes to read and might change your mind.",
        "What specific concerns do you have about AI booking systems?"
      ],
      
      "already_have_system": [
        "That's great! What's your current system missing that causes you to lose patients?",
        "Our premium service includes features like dedicated account management and priority support.",
        "Our AI never gets tired or makes mistakes like human staff sometimes do."
      ],
      
      "need_to_think": [
        "I understand you want to think about it. What specific concerns do you have?",
        "I can address them now so you have all the information you need.",
        "What would help you make a decision today?"
      ]
    };
  }

  // Generate follow-up sequence
  getFollowUpSequence() {
    return {
      immediate: {
        email: {
          subject: "Quick case study: How we increased [Practice Name] bookings by 300%",
          body: `Hi ${decisionMaker.name},

Thank you for taking my call today about our AI booking solution for ${business.name}.

As promised, here's the case study I mentioned:
[Case Study Content]

I also wanted to confirm our demo appointment:
📅 ${appointmentDate} at ${appointmentTime}
🔗 Calendar invite attached

Our premium service typically generates £10,000-15,000 additional monthly revenue for practices like yours.

Looking forward to showing you how this works!

Best regards,
Sarah
AI Booking Solutions`
        }
      },
      
      day1: {
        sms: "Hi ${name}, this is Sarah from AI Booking Solutions. Just confirming our demo tomorrow at ${time}. I'll send the Zoom link 30 minutes before. Looking forward to showing you how we can increase ${practice} bookings by 300%!"
      },
      
      day7: {
        email: {
          subject: "Following up on our demo - ROI calculator attached",
          body: "Hi ${name}, I hope you found our demo valuable. I've attached our ROI calculator specifically for ${practice}. Most practices see 20-30x return on investment within 30 days. Would you like to schedule a follow-up call?"
        }
      }
    };
  }
}

// Campaign management functions
export class ColdCallCampaignManager {
  constructor() {
    this.campaigns = new Map();
    this.leadQueue = [];
    this.results = [];
  }

  // Create a new campaign
  createCampaign(config) {
    const campaign = {
      id: `campaign_${Date.now()}`,
      name: config.name || 'Dental Practice Outreach',
      targetIndustry: 'dental',
      maxCallsPerDay: config.maxCallsPerDay || 50,
      businessHours: { start: '09:00', end: '17:00' },
      timezone: 'Europe/London',
      status: 'active',
      createdAt: new Date().toISOString(),
      results: {
        totalCalls: 0,
        appointmentsBooked: 0,
        conversionRate: 0,
        revenue: 0
      },
      ...config
    };
    
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  // Add leads to campaign
  addLeadsToCampaign(campaignId, leads) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    leads.forEach(lead => {
      this.leadQueue.push({
        ...lead,
        campaignId,
        priority: this.calculateLeadPriority(lead),
        status: 'queued',
        addedAt: new Date().toISOString()
      });
    });
    
    // Sort by priority
    this.leadQueue.sort((a, b) => b.priority - a.priority);
  }

  // Calculate lead priority based on multiple factors
  calculateLeadPriority(lead) {
    let priority = 50; // Base priority
    
    // Decision maker score
    if (lead.decisionMaker?.role === 'owner') priority += 30;
    else if (lead.decisionMaker?.role === 'manager') priority += 20;
    
    // Business size indicators
    if (lead.business?.employees > 10) priority += 20;
    if (lead.business?.revenue > 100000) priority += 15;
    
    // Pain point severity
    if (lead.painPoints?.includes('missed_calls')) priority += 25;
    if (lead.painPoints?.includes('no_shows')) priority += 15;
    
    // Location (premium areas)
    if (lead.business?.postcode?.match(/^[SW|W1|EC|WC]/)) priority += 10;
    
    return Math.min(priority, 100);
  }

  // Process campaign queue
  async processCampaignQueue() {
    const activeCampaigns = Array.from(this.campaigns.values()).filter(c => c.status === 'active');
    
    for (const campaign of activeCampaigns) {
      const campaignLeads = this.leadQueue.filter(l => 
        l.campaignId === campaign.id && 
        l.status === 'queued' &&
        this.isBusinessHours()
      );
      
      // Process up to max calls per day
      const leadsToProcess = campaignLeads.slice(0, campaign.maxCallsPerDay);
      
      for (const lead of leadsToProcess) {
        try {
          await this.makeCall(lead, campaign);
          lead.status = 'called';
          campaign.results.totalCalls++;
        } catch (error) {
          console.error('Call failed:', error);
          lead.status = 'failed';
        }
      }
    }
  }

  // Make individual call
  async makeCall(lead, campaign) {
    const bot = new EnhancedColdCallBot();
    const script = bot.generatePersonalizedScript(lead);
    
    // Make VAPI call with enhanced script
    const callData = {
      assistantId: campaign.assistantId,
      customer: {
        number: lead.business.phone,
        name: lead.decisionMaker?.name || lead.business.name
      },
      metadata: {
        campaignId: campaign.id,
        leadId: lead.id,
        practiceName: lead.business.name,
        decisionMaker: lead.decisionMaker,
        priority: lead.priority,
        script: script
      }
    };
    
    // Call VAPI API
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });
    
    if (!response.ok) {
      throw new Error(`VAPI call failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Track results
    this.results.push({
      leadId: lead.id,
      campaignId: campaign.id,
      callId: result.id,
      timestamp: new Date().toISOString(),
      status: 'initiated'
    });
    
    return result;
  }

  // Check if it's business hours
  isBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Monday to Friday, 9 AM to 5 PM
    return day >= 1 && day <= 5 && hour >= 9 && hour <= 17;
  }

  // Get campaign analytics
  getCampaignAnalytics(campaignId) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;
    
    const campaignResults = this.results.filter(r => r.campaignId === campaignId);
    const appointmentsBooked = campaignResults.filter(r => r.status === 'appointment_booked').length;
    
    return {
      ...campaign.results,
      conversionRate: (appointmentsBooked / campaign.results.totalCalls * 100).toFixed(1),
      estimatedRevenue: appointmentsBooked * 500 * 12, // £500/month * 12 months
      avgCallDuration: this.calculateAverageCallDuration(campaignResults),
      topPainPoints: this.getTopPainPoints(campaignResults),
      bestPerformingTimes: this.getBestPerformingTimes(campaignResults)
    };
  }

  calculateAverageCallDuration(results) {
    const durations = results.map(r => r.duration).filter(d => d);
    return durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  getTopPainPoints(results) {
    const painPoints = {};
    results.forEach(r => {
      if (r.painPoints) {
        r.painPoints.forEach(p => {
          painPoints[p] = (painPoints[p] || 0) + 1;
        });
      }
    });
    return Object.entries(painPoints)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([pain, count]) => ({ pain, count }));
  }

  getBestPerformingTimes(results) {
    const timePerformance = {};
    results.forEach(r => {
      const hour = new Date(r.timestamp).getHours();
      timePerformance[hour] = (timePerformance[hour] || 0) + 1;
    });
    return Object.entries(timePerformance)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour, calls]) => ({ hour, calls }));
  }
}

export default { EnhancedColdCallBot, ColdCallCampaignManager };
