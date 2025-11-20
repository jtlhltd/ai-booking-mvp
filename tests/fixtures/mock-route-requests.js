// tests/fixtures/mock-route-requests.js
// Mock route file requests for testing

export function mockRouteRequest(routeName, method = 'GET', params = {}) {
  const baseRequest = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.TEST_API_KEY || 'test-api-key'
    },
    params: {},
    query: {},
    body: {},
    ...params
  };
  
  const routes = {
    appointments: {
      lookup: {
        ...baseRequest,
        method: 'GET',
        params: { clientKey: 'test_client' },
        query: { phone: '+447491683261' }
      },
      reschedule: {
        ...baseRequest,
        method: 'POST',
        params: { clientKey: 'test_client', appointmentId: 'appt123' },
        body: { newTime: '2025-01-15T10:00:00Z' }
      },
      cancel: {
        ...baseRequest,
        method: 'POST',
        params: { clientKey: 'test_client', appointmentId: 'appt123' },
        body: { reason: 'Customer requested' }
      }
    },
    
    clients: {
      list: {
        ...baseRequest,
        method: 'GET',
        query: { limit: 10, offset: 0 }
      },
      get: {
        ...baseRequest,
        method: 'GET',
        params: { clientKey: 'test_client' }
      },
      create: {
        ...baseRequest,
        method: 'POST',
        body: {
          businessName: 'Test Business',
          industry: 'healthcare'
        }
      }
    },
    
    leads: {
      create: {
        ...baseRequest,
        method: 'POST',
        body: {
          service: 'logistics',
          lead: {
            name: 'Test Lead',
            phone: '+447491683261'
          }
        }
      }
    },
    
    receptionist: {
      businessInfo: {
        ...baseRequest,
        method: 'GET',
        params: { clientKey: 'test_client' }
      },
      customerProfile: {
        ...baseRequest,
        method: 'GET',
        params: { clientKey: 'test_client' },
        query: { phone: '+447491683261' }
      }
    },
    
    twilioWebhook: {
      smsInbound: {
        ...baseRequest,
        method: 'POST',
        body: {
          From: '+447491683261',
          To: '+447403934440',
          Body: 'START',
          MessageSid: 'SM123',
          MessagingServiceSid: 'MG123'
        }
      }
    },
    
    vapiWebhook: {
      callCompleted: {
        ...baseRequest,
        method: 'POST',
        body: {
          call: {
            id: 'call123',
            status: 'completed',
            transcript: 'Test transcript'
          }
        }
      }
    }
  };
  
  return routes[routeName] || baseRequest;
}

