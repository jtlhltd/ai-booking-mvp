import './styles.css';

const API_BASE = window.location.origin;
let searchResults = [];
let mobileResults = [];

function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  if (status) {
    status.innerHTML = `<div class="${type}">${message}</div>`;
  }
}

function showProgress(targetMobile) {
  const progressIndicator = document.getElementById('progressIndicator');
  const currentMobileCount = document.getElementById('currentMobileCount');
  const targetMobileCount = document.getElementById('targetMobileCount');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressDetails = document.getElementById('progressDetails');

  progressIndicator.style.display = 'block';
  targetMobileCount.textContent = String(targetMobile);
  currentMobileCount.textContent = '0';
  progressBarFill.style.width = '0%';
  progressDetails.textContent = 'Starting search...';
}

function updateProgress(currentMobile, targetMobile, totalProcessed, currentQuery) {
  const currentMobileCount = document.getElementById('currentMobileCount');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressDetails = document.getElementById('progressDetails');

  currentMobileCount.textContent = String(currentMobile);
  const percentage = Math.min((currentMobile / targetMobile) * 100, 100);
  progressBarFill.style.width = `${percentage}%`;

  progressDetails.textContent = `Found ${currentMobile}/${targetMobile} mobile numbers • Processed ${totalProcessed} businesses • Current: ${currentQuery}`;
}

function hideProgress() {
  const progressIndicator = document.getElementById('progressIndicator');
  progressIndicator.style.display = 'none';
}

function useTemplate(templateType, event) {
  const templates = {
    'private-healthcare': {
      query: '"private GP" "private doctor" "private medical practice" "consultant" "private clinic"',
      location: 'United Kingdom',
      description: 'Private healthcare practices with mobile numbers',
    },
    'financial-advisors': {
      query: '"independent financial advisor" "IFA" "wealth manager" "financial planner" "private wealth"',
      location: 'United Kingdom',
      description: 'Independent financial advisors and wealth managers',
    },
    'dental-practices': {
      query: '"private dentist" "dental surgeon" "orthodontist" "dental specialist" "private dental"',
      location: 'United Kingdom',
      description: 'Private dental practices and specialists',
    },
    'legal-services': {
      query: '"solicitor" "barrister" "lawyer" "legal advisor" "private practice"',
      location: 'United Kingdom',
      description: 'Legal professionals and law firms',
    },
    'property-agents': {
      query: '"property consultant" "property advisor" "real estate consultant" "property specialist" "estate agent"',
      location: 'United Kingdom',
      description: 'Property consultants and real estate professionals',
    },
    'business-coaching': {
      query: '"business coach" "executive coach" "business consultant" "management consultant" "private coach"',
      location: 'United Kingdom',
      description: 'Business coaches and consultants',
    },
    'accounting-services': {
      query: '"chartered accountant" "accounting firm" "tax advisor" "bookkeeper" "private accountant"',
      location: 'United Kingdom',
      description: 'Accounting and tax professionals',
    },
    'marketing-agencies': {
      query: '"marketing agency" "digital marketing" "marketing consultant" "advertising agency" "private marketing"',
      location: 'United Kingdom',
      description: 'Marketing agencies and consultants',
    },
    'it-services': {
      query: '"IT consultant" "software developer" "tech consultant" "IT support" "private IT"',
      location: 'United Kingdom',
      description: 'IT consultants and tech professionals',
    },
    'consulting-firms': {
      query: '"management consultant" "strategy consultant" "business advisor" "private consultant"',
      location: 'United Kingdom',
      description: 'Management and strategy consultants',
    },
  };

  const template = templates[templateType];
  if (template) {
    document.getElementById('businessType').value = template.query;
    document.getElementById('location').value = template.location;

    document.querySelectorAll('.template-card').forEach((card) => {
      card.classList.remove('selected');
    });

    event?.target?.closest?.('.template-card')?.classList?.add?.('selected');

    showStatus(`Template "${templateType.replace('-', ' ')}" loaded`, 'success');
  }
}

async function startSearch() {
  const businessType = document.getElementById('businessType').value.trim();
  const locationSelect = document.getElementById('location').value;
  const customLocation = document.getElementById('customLocation').value.trim();
  const maxResults = parseInt(document.getElementById('maxResults').value);
  const businessSize = document.getElementById('businessSize').value;
  const mobileOnly = document.getElementById('mobileOnly').checked;
  const decisionMakerTitles = document.getElementById('decisionMakerTitles').checked;

  if (!businessType) {
    showStatus('Please enter a business type to search for', 'error');
    return;
  }

  let location;
  if (locationSelect === 'custom') {
    if (!customLocation) {
      showStatus('Please enter a custom location', 'error');
      return;
    }
    location = customLocation;
  } else {
    location = locationSelect;
  }

  // Force single search only - batch search disabled
  await startSingleSearch(businessType, location, maxResults, businessSize, mobileOnly, decisionMakerTitles);
}

async function startSingleSearch(businessType, location, maxResults, businessSize, mobileOnly, decisionMakerTitles) {
  showStatus(`Searching for "${businessType}" in ${location}... (Target: ${maxResults} mobile numbers)`, 'info');
  showProgress(maxResults);

  try {
    const response = await fetch(`${API_BASE}/api/search-google-places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: businessType,
        location: location,
        maxResults: maxResults,
        businessSize: businessSize,
        mobileOnly: false, // Get all results, filter client-side
        decisionMakerTitles: decisionMakerTitles,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.success) {
        searchResults = data.results || [];

        // Add decision maker detection if enabled
        if (decisionMakerTitles) {
          searchResults = searchResults.map((business) => ({
            ...business,
            decisionMaker: extractDecisionMaker(business.name, business.industry),
            decisionMakerTitle: getDecisionMakerTitle(business.name, business.industry),
          }));
        }

        // Apply client-side filtering based on mobileOnly setting
        if (mobileOnly) {
          const allMobileResults = searchResults.filter((business) => business.hasMobile === true);
          mobileResults = allMobileResults.slice(0, maxResults);
        } else {
          mobileResults = searchResults.slice(0, maxResults);
        }

        updateStats();
        updateResults();
        hideProgress();

        const totalCount = searchResults.length;
        const mobileCount = mobileResults.length;
        const decisionMakerCount = searchResults.filter((b) => b.decisionMakerTitle).length;

        if (mobileOnly && mobileCount === 0 && totalCount > 0) {
          showStatus(
            `Found ${totalCount} businesses but none with mobile numbers. Try these mobile-friendly search terms:<br><br>
                    • "private [business type]"<br>
                    • "[business type] consultant"<br>
                    • "[business type] advisor"<br>
                    • "independent [business type]"<br>
                    • "[business type] specialist"`,
            'warning'
          );
        } else if (mobileCount < maxResults && mobileCount > 0) {
          showStatus(
            `Found ${totalCount} businesses total, ${mobileCount} mobile numbers (Target: ${maxResults}). Try different search terms for more mobile numbers.`,
            'info'
          );
        } else {
          showStatus(
            `Found ${totalCount} businesses total, ${mobileCount} with mobile numbers${
              decisionMakerCount > 0 ? `, ${decisionMakerCount} with decision maker titles` : ''
            }${mobileCount >= maxResults ? ' - TARGET REACHED!' : ''}`,
            'success'
          );
        }
      } else {
        showStatus(`Search failed: ${data.error}`, 'error');
      }
    } else {
      const errorData = await response.json();
      showStatus(`API Error: ${errorData.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    showStatus(`Search error: ${error.message}`, 'error');
  }
}

function extractDecisionMaker(businessName) {
  const namePatterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+)/,
    /^([A-Z][a-z]+ & [A-Z][a-z]+)/,
    /^([A-Z][a-z]+'s)/,
    /^([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)/,
  ];

  for (const pattern of namePatterns) {
    const match = businessName.match(pattern);
    if (match) {
      return match[1].replace("'s", '');
    }
  }

  const firstWord = businessName.split(' ')[0];
  return `${firstWord} (Owner)`;
}

function getDecisionMakerTitle(_businessName, industry) {
  const titles = {
    healthcare: ['Practice Owner', 'Principal Doctor', 'Practice Manager', 'Clinic Director'],
    dental: ['Practice Owner', 'Principal Dentist', 'Practice Manager'],
    legal: ['Managing Partner', 'Senior Partner', 'Practice Manager'],
    financial: ['Senior Partner', 'Managing Director', 'Principal Advisor'],
    property: ['Branch Manager', 'Managing Director', 'Principal'],
    coaching: ['Founder', 'Managing Director', 'Principal Consultant'],
  };

  const industryTitles = titles[industry] || titles.healthcare;
  return industryTitles[Math.floor(Math.random() * industryTitles.length)];
}

function updateStats() {
  document.getElementById('totalFound').textContent = String(searchResults.length);
  document.getElementById('mobileFound').textContent = String(mobileResults.length);
  document.getElementById('exportedCount').textContent = String(mobileResults.length);
}

function updateResults() {
  const container = document.getElementById('searchResults');
  const filterText = document.getElementById('resultsFilterText');
  const mobileOnly = document.getElementById('mobileOnly').checked;

  filterText.textContent = mobileOnly ? '(Mobile Numbers Only)' : '(All Results)';

  if (mobileResults.length === 0) {
    let message;
    if (mobileOnly && searchResults.length > 0) {
      message = `Found ${searchResults.length} businesses but none with mobile numbers. Try these mobile-friendly search terms:<br><br>
                    • "private [business type]"<br>
                    • "[business type] consultant"<br>
                    • "[business type] advisor"<br>
                    • "independent [business type]"<br>
                    • "[business type] specialist"`;
    } else {
      message = 'No businesses found. Try a different search term or location.';
    }
    container.innerHTML = `<div class="loading">${message}</div>`;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('exportBtn2').disabled = true;
    document.getElementById('pipelineBtn').disabled = true;
    return;
  }

  container.innerHTML = mobileResults
    .map(
      (business) => `
        <div class="result-item">
          <div class="result-info">
            <div class="result-name">
              ${business.name}
              ${business.decisionMakerTitle ? `<span class="decision-maker-badge">${business.decisionMakerTitle}</span>` : ''}
              ${business.businessSize ? `<span class="business-size-badge">${business.businessSize}</span>` : ''}
              ${business.verified ? `<span class="verified-badge">Verified</span>` : ''}
            </div>
            <div class="result-details">
              📞 ${business.phone} | 📧 ${business.email || 'No email'} | 🌐 ${business.website || 'No website'}<br>
              ${business.decisionMaker ? `👤 Decision Maker: ${business.decisionMaker}` : ''}<br>
              📍 ${business.address} | 🏷️ ${business.industry || 'Business'} | 🔍 ${business.source}
            </div>
          </div>
          <div class="result-actions">
            ${business.hasMobile ? '<span class="mobile-badge">📱 Mobile</span>' : '<span class="business-size-badge">☎️ Landline</span>'}
          </div>
        </div>
      `
    )
    .join('');

  document.getElementById('exportBtn').disabled = false;
  document.getElementById('exportBtn2').disabled = false;
  document.getElementById('pipelineBtn').disabled = false;
}

function clearResults() {
  searchResults = [];
  mobileResults = [];
  updateStats();
  updateResults();
  showStatus('Search results cleared', 'success');
}

function exportToCSV() {
  if (mobileResults.length === 0) {
    showStatus('No results to export', 'error');
    return;
  }

  const mobileOnlyResults = mobileResults.filter((business) => business.hasMobile);

  if (mobileOnlyResults.length === 0) {
    showStatus('No mobile numbers found to export', 'error');
    return;
  }

  const csvHeader =
    'business_name,phone,email,website,address,industry,source,decision_maker,decision_maker_title,business_size,verified\n';
  const csvBody = mobileOnlyResults
    .map(
      (business) =>
        `"${business.name}","${business.phone}","${business.email || ''}","${business.website || ''}","${business.address}","${business.industry || ''}","${business.source}","${business.decisionMaker || ''}","${business.decisionMakerTitle || ''}","${business.businessSize || ''}","${business.verified ? 'Yes' : 'No'}"`
    )
    .join('\n');
  const csv = csvHeader + csvBody;

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mobile_leads_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showStatus(`Exported ${mobileOnlyResults.length} mobile leads to CSV`, 'success');
}

async function addToPipeline() {
  const mobileLeads = mobileResults.filter((business) => business.hasMobile);

  if (mobileLeads.length === 0) {
    showStatus('No mobile leads to add to pipeline', 'error');
    return;
  }

  showStatus(`Adding ${mobileLeads.length} mobile leads to pipeline...`, 'info');

  let addedCount = 0;
  let errorCount = 0;

  for (const business of mobileLeads) {
    try {
      const response = await fetch(`${API_BASE}/api/initiate-lead-capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadData: {
            decisionMaker: `${business.name.split(' ')[0]} (Owner)`,
            phoneNumber: business.phone,
            businessName: business.name,
            industry: business.industry || 'Business',
            location: business.address,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          addedCount++;
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
    }
  }

  showStatus(`Successfully added ${addedCount} leads to pipeline! ${errorCount} errors occurred.`, 'success');
}

function setupLocationDropdown() {
  const locationSelect = document.getElementById('location');
  const customLocationGroup = document.getElementById('customLocationGroup');

  locationSelect.addEventListener('change', function () {
    if (this.value === 'custom') {
      customLocationGroup.style.display = 'block';
    } else {
      customLocationGroup.style.display = 'none';
    }
  });
}

// Expose handlers for inline onclick attributes
window.useTemplate = useTemplate;
window.startSearch = startSearch;
window.clearResults = clearResults;
window.exportToCSV = exportToCSV;
window.addToPipeline = addToPipeline;

window.addEventListener('DOMContentLoaded', () => {
  setupLocationDropdown();
});

window.onload = function () {
  showStatus('Ready to search Google Places across the UK for businesses with mobile numbers', 'info');
};

