// tests/fixtures/mock-webhooks.js
// Mock VAPI webhook payloads for testing

export function createMockWebhook(scenario = 'default') {
  const basePayload = {
    call: {
      id: `test_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed',
      outcome: 'completed',
      duration: 180,
      cost: 0.15,
      transcript: '',
      recordingUrl: 'https://api.vapi.ai/recordings/test123.mp3',
      metrics: {
        talk_time_ratio: 0.65,
        interruptions: 2,
        response_time_avg: 1.2,
        completion_rate: 1.0
      }
    },
    status: 'completed',
    metadata: {
      tenantKey: 'test_client',
      leadPhone: '+447491683261',
      businessName: 'Test Business Ltd',
      decisionMaker: 'John Smith'
    }
  };
  
  const scenarios = {
    default: basePayload,
    
    withTranscript: {
      ...basePayload,
      call: {
        ...basePayload.call,
        transcript: 'Hi, this is a test call transcript with logistics data. We ship with DHL and FedEx, about 50 packages per week to USA and Germany. Email: test@example.com'
      }
    },
    
    withStructuredOutput: {
      ...basePayload,
      call: {
        ...basePayload.call,
        structuredOutput: {
          businessName: 'Test Business Ltd',
          decisionMaker: 'John Smith',
          email: 'test@example.com',
          internationalYN: 'Y',
          courier1: 'DHL',
          courier2: 'FedEx',
          frequency: '50 per week',
          country1: 'USA',
          country2: 'Germany',
          exampleShipment: '5kg, 30x20x15cm',
          exampleShipmentCost: '£7',
          domesticFrequency: '20 per day',
          ukCourier: 'Royal Mail',
          standardRateUpToKg: '2kg',
          exclFuelVAT: 'Y',
          singleVsMultiParcel: 'Single',
          receptionistName: 'Sarah',
          callbackNeeded: 'N'
        }
      }
    },
    
    withToolCalls: {
      ...basePayload,
      toolCalls: [{
        function: {
          name: 'access_google_sheet',
          arguments: JSON.stringify({
            action: 'append',
            data: {
              businessName: 'Test Business Ltd',
              decisionMaker: 'John Smith',
              phone: '+447491683261',
              email: 'test@example.com',
              international: 'Y',
              mainCouriers: ['DHL', 'FedEx'],
              frequency: '50 per week',
              mainCountries: ['USA', 'Germany']
            }
          })
        }
      }]
    },
    
    withCallbackTool: {
      ...basePayload,
      toolCalls: [{
        function: {
          name: 'schedule_callback',
          arguments: JSON.stringify({
            businessName: 'Test Business',
            phone: '+447491683261',
            receptionistName: 'Sarah',
            reason: 'Decision maker not available',
            preferredTime: 'Tomorrow 2pm',
            notes: 'Call back for pricing discussion'
          })
        }
      }]
    },
    
    noAnswer: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'no-answer',
        duration: 5
      }
    },
    
    busy: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'busy',
        duration: 3
      }
    },
    
    voicemail: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'voicemail',
        duration: 30
      }
    },
    
    declined: {
      ...basePayload,
      call: {
        ...basePayload.call,
        status: 'ended',
        outcome: 'declined',
        duration: 2
      }
    },
    
    interested: {
      ...basePayload,
      call: {
        ...basePayload.call,
        outcome: 'interested',
        transcript: 'Yes, I am interested in your services. Please send me more information.'
      }
    },
    
    booked: {
      ...basePayload,
      call: {
        ...basePayload.call,
        outcome: 'booked',
        transcript: 'Yes, let\'s book an appointment for next week.'
      },
      bookingStart: '2025-01-15T10:00:00Z',
      bookingEnd: '2025-01-15T10:30:00Z'
    },
    
    notInterested: {
      ...basePayload,
      call: {
        ...basePayload.call,
        outcome: 'not-interested',
        transcript: 'No, I am not interested. Please remove me from your list.'
      }
    },
    
    shortTranscript: {
      ...basePayload,
      call: {
        ...basePayload.call,
        transcript: 'Hi, bye.'
      }
    },
    
    noTranscript: {
      ...basePayload,
      call: {
        ...basePayload.call,
        transcript: ''
      }
    },
    
    withMessageEnvelope: {
      message: {
        type: 'call-status',
        call: {
          id: `test_call_${Date.now()}`,
          status: 'completed',
          transcript: 'Test transcript in message envelope',
          recordingUrl: 'https://api.vapi.ai/recordings/test.mp3'
        }
      }
    },

    // VAPI end-of-call-report: sends endedReason, not outcome; we map to outcome in webhook
    endOfCallReportNoAnswer: {
      message: {
        type: 'end-of-call-report',
        endedReason: 'customer-did-not-answer',
        call: {
          id: `eoc_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'ended',
          duration: 12
        },
        transcript: ''
      },
      metadata: {
        tenantKey: 'test_client',
        leadPhone: '+447700900111'
      }
    },

    endOfCallReportVoicemail: {
      message: {
        type: 'end-of-call-report',
        endedReason: 'voicemail',
        call: {
          id: `eoc_voicemail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'ended',
          duration: 45
        }
      },
      metadata: {
        tenantKey: 'test_client',
        leadPhone: '+447700900222'
      }
    }
  };

  return scenarios[scenario] || basePayload;
}

export const mockWebhookScenarios = Object.keys({
  default: true,
  withTranscript: true,
  withStructuredOutput: true,
  withToolCalls: true,
  withCallbackTool: true,
  noAnswer: true,
  busy: true,
  voicemail: true,
  declined: true,
  interested: true,
  booked: true,
  notInterested: true,
  shortTranscript: true,
  noTranscript: true,
  withMessageEnvelope: true,
  endOfCallReportNoAnswer: true,
  endOfCallReportVoicemail: true
});

