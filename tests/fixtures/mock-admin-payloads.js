// tests/fixtures/mock-admin-payloads.js
// Mock admin API request/response payloads

export const adminRequests = {
  createClient: {
    businessName: 'Test Business',
    industry: 'healthcare',
    ownerEmail: 'owner@test.com',
    ownerPhone: '+447700900000',
    timezone: 'Europe/London'
  },
  
  updateClient: {
    displayName: 'Updated Business Name',
    timezone: 'America/New_York',
    isEnabled: true
  },
  
  createLead: {
    name: 'Test Lead',
    phone: '+447491683261',
    email: 'lead@test.com',
    service: 'consultation',
    source: 'website'
  },
  
  bulkOperation: {
    operation: 'update_status',
    leadIds: ['lead1', 'lead2', 'lead3'],
    data: {
      status: 'contacted'
    }
  },
  
  searchQuery: {
    query: 'test',
    type: 'leads',
    limit: 10
  },
  
  filterRequest: {
    type: 'leads',
    filters: {
      status: 'pending',
      dateRange: {
        start: '2025-01-01',
        end: '2025-01-31'
      }
    }
  }
};

export const adminResponses = {
  success: {
    success: true,
    message: 'Operation completed successfully'
  },
  
  error: {
    success: false,
    error: 'Operation failed',
    message: 'Error details here'
  },
  
  clientList: {
    success: true,
    clients: [
      {
        clientKey: 'test_client_1',
        displayName: 'Test Client 1',
        isEnabled: true
      }
    ],
    total: 1
  },
  
  analytics: {
    success: true,
    data: {
      totalLeads: 100,
      totalCalls: 80,
      totalBookings: 20,
      conversionRate: 25
    }
  }
};

