const BASE_URL = window.location.origin;
let currentTenant = null;
let tenants = [];

function isDemoMode() {
  const params = new URLSearchParams(window.location.search || '');
  return params.get('demo') === '1' || params.get('demo') === 'true';
}

async function fetchPublic(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return await response.json();
}

async function loadTenants() {
  try {
    // Try to load from public health endpoint first
    const health = await fetchPublic(`${BASE_URL}/health`);

    if (isDemoMode()) {
      tenants = ['victory_dental', 'northside_vet'];
    } else {
      // Optional: if /health exposes tenant keys, use them; otherwise keep empty.
      tenants = Array.isArray(health?.tenants) ? health.tenants : [];
    }

    const select = document.getElementById('tenantSelect');
    select.innerHTML = '<option value="">Select a tenant...</option>';

    tenants.forEach((tenantKey) => {
      const option = document.createElement('option');
      option.value = tenantKey;
      option.textContent = getTenantDisplayName(tenantKey);
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load tenants:', error);
    tenants = isDemoMode() ? ['victory_dental', 'northside_vet'] : [];
    const select = document.getElementById('tenantSelect');
    select.innerHTML = '<option value="">Select a tenant...</option>';

    tenants.forEach((tenantKey) => {
      const option = document.createElement('option');
      option.value = tenantKey;
      option.textContent = getTenantDisplayName(tenantKey);
      select.appendChild(option);
    });
  }
}

function getTenantDisplayName(tenantKey) {
  const names = {
    victory_dental: 'Victory Dental',
    northside_vet: 'Northside Vet',
  };
  return names[tenantKey] || tenantKey;
}

async function switchTenant() {
  const tenantKey = document.getElementById('tenantSelect').value;
  if (!tenantKey) {
    currentTenant = null;
    document.getElementById('tenantInfo').style.display = 'none';
    return;
  }

  currentTenant = tenantKey;
  await loadTenantData();
}

async function loadTenantData() {
  if (!currentTenant) return;

  try {
    // Demo-only data (no authentication required).
    // In non-demo mode we do not assume tenant keys or values.
    const tenantData = isDemoMode() ? getDemoTenantData(currentTenant) : null;
    if (!tenantData) {
      throw new Error('Tenant data is not available (enable demo mode with ?demo=1)');
    }

    // Update tenant info
    document.getElementById('tenantInfo').style.display = 'block';
    document.getElementById('tenantName').textContent = tenantData.displayName;
    document.getElementById('tenantPhone').textContent = tenantData.phone;
    document.getElementById('tenantTimezone').textContent = tenantData.timezone;
    document.getElementById('tenantStatus').textContent = 'Active';
    document.getElementById('tenantStatus').className = 'status healthy';

    // Update tenant metrics
    document.getElementById('tenant-metrics').innerHTML = `
      <div class="metric">
        <span class="metric-label">Total Leads</span>
        <span class="metric-value">${tenantData.totalLeads}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Total Calls</span>
        <span class="metric-value">${tenantData.totalCalls}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Last 24h Leads</span>
        <span class="metric-value">${tenantData.last24hLeads}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Conversion Rate</span>
        <span class="metric-value">${tenantData.conversionRate}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">Success Rate</span>
        <span class="metric-value">${tenantData.successRate}%</span>
      </div>
    `;

    // Update performance metrics
    document.getElementById('performance-metrics').innerHTML = `
      <div class="metric">
        <span class="metric-label">Avg Lead Score</span>
        <span class="metric-value">${tenantData.avgLeadScore}</span>
      </div>
      <div class="metric">
        <span class="metric-label">High Priority</span>
        <span class="metric-value">${tenantData.highPriorityLeads}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Medium Priority</span>
        <span class="metric-value">${tenantData.mediumPriorityLeads}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Low Priority</span>
        <span class="metric-value">${tenantData.lowPriorityLeads}</span>
      </div>
    `;

    // Update SMS config
    document.getElementById('sms-config').innerHTML = `
      <div class="metric">
        <span class="metric-label">From Number</span>
        <span class="metric-value">${tenantData.phone}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Messaging Service</span>
        <span class="metric-value">MG852f3cf7b50ef1be50c566be9e7efa04</span>
      </div>
      <div class="metric">
        <span class="metric-label">Status</span>
        <span class="status healthy">Active</span>
      </div>
    `;

    // Update business hours
    document.getElementById('business-hours').innerHTML = `
      <div class="metric">
        <span class="metric-label">Timezone</span>
        <span class="metric-value">${tenantData.timezone}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Hours</span>
        <span class="metric-value">9AM - 5PM</span>
      </div>
      <div class="metric">
        <span class="metric-label">Days</span>
        <span class="metric-value">Mon - Fri</span>
      </div>
      <div class="metric">
        <span class="metric-label">Current Status</span>
        <span class="status ${isBusinessHours() ? 'healthy' : 'warning'}">${
      isBusinessHours() ? 'Open' : 'Closed'
    }</span>
      </div>
    `;

    // Update leads
    document.getElementById('leads-list').innerHTML = tenantData.leads
      .map(
        (lead) => `
          <div class="lead-item">
            <div class="lead-phone">${lead.phone}</div>
            <div class="lead-status">Status: ${lead.status} • Last: ${lead.lastMessage}</div>
            <div class="lead-score">Score: ${lead.score}</div>
          </div>
        `
      )
      .join('');
  } catch (error) {
    console.error('Failed to load tenant data:', error);
    document.getElementById('tenant-metrics').innerHTML = `
      <div class="error">Failed to load tenant data: ${error.message}</div>
    `;
  }
}

function getDemoTenantData(tenantKey) {
  const data = {
    victory_dental: {
      displayName: 'Victory Dental',
      phone: '+447403934440',
      timezone: 'Europe/London',
      totalLeads: 1,
      totalCalls: 0,
      last24hLeads: 1,
      conversionRate: 0,
      successRate: 100,
      avgLeadScore: 80,
      highPriorityLeads: 1,
      mediumPriorityLeads: 0,
      lowPriorityLeads: 0,
      leads: [
        {
          phone: '+447491683261',
          status: 'engaged',
          lastMessage: 'START message',
          score: 80,
        },
      ],
    },
    northside_vet: {
      displayName: 'Northside Vet',
      phone: '+447491683261',
      timezone: 'Europe/London',
      totalLeads: 0,
      totalCalls: 0,
      last24hLeads: 0,
      conversionRate: 0,
      successRate: 100,
      avgLeadScore: 0,
      highPriorityLeads: 0,
      mediumPriorityLeads: 0,
      lowPriorityLeads: 0,
      leads: [],
    },
  };
  return data[tenantKey] || null;
}

function getTenantPhone(tenantKey) {
  const phoneMap = {
    victory_dental: '+447403934440',
    northside_vet: '+447491683261',
  };
  return phoneMap[tenantKey] || 'Unknown';
}

function isBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

function testTenantSMS() {
  if (!currentTenant) {
    alert('Please select a tenant first');
    return;
  }

  const phone = getTenantPhone(currentTenant);
  alert(
    `SMS Test for ${currentTenant}:\n\nSend "START" to:\n${phone}\n\nCheck logs for [AUTO-CALL TRIGGER] or [AUTO-CALL DEFERRED]`
  );
}

function refreshTenantData() {
  if (currentTenant) loadTenantData();
}

function viewTenantLogs() {
  window.open('https://dashboard.render.com/web/srv-d2vvdqbuibrs73dq57ug/logs', '_blank');
}

// Auto-refresh every 30 seconds
setInterval(() => {
  if (currentTenant) loadTenantData();
}, 30000);

document.addEventListener('DOMContentLoaded', loadTenants);

// Needed because index.html uses inline handlers.
window.switchTenant = switchTenant;
window.testTenantSMS = testTenantSMS;
window.refreshTenantData = refreshTenantData;
window.viewTenantLogs = viewTenantLogs;

