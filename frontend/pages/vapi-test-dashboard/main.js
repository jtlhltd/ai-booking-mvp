import { initBrowserSentry } from '../../shared/sentry.js';

initBrowserSentry();

const API_BASE = window.location.origin;

function getApiKey() {
  return document.getElementById('apiKey').value || localStorage.getItem('apiKey');
}

function setApiKey(key) {
  localStorage.setItem('apiKey', key);
  document.getElementById('apiKey').value = key;
}

function showResult(elementId, message, type = 'info') {
  const element = document.getElementById(elementId);
  element.style.display = 'block';
  element.className = `result ${type}`;
  element.textContent = message;
}

async function testApiKey() {
  const apiKey = document.getElementById('apiKey').value;
  if (!apiKey) {
    showResult('apiKeyResult', 'Please enter an API key', 'error');
    return;
  }

  setApiKey(apiKey);
  showResult('apiKeyResult', 'API key saved successfully!', 'success');
}

async function testVapiConnection() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showResult('connectionResult', 'Please enter an API key first', 'error');
    return;
  }

  try {
    showResult('connectionResult', 'Testing VAPI connection...', 'info');

    const response = await fetch(`${API_BASE}/admin/vapi/test-connection`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.success) {
      showResult(
        'connectionResult',
        `✅ VAPI Connection Successful!\n\nAssistants Count: ${data.assistantsCount}\nAPI Key Configured: ${data.apiKeyConfigured}`,
        'success'
      );
    } else {
      showResult('connectionResult', `❌ VAPI Connection Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
    }
  } catch (error) {
    showResult('connectionResult', `❌ Error: ${error.message}`, 'error');
  }
}

async function makeTestCall() {
  const apiKey = getApiKey();
  const phoneNumber = document.getElementById('phoneNumber').value;

  if (!apiKey) {
    showResult('callResult', 'Please enter an API key first', 'error');
    return;
  }

  if (!phoneNumber) {
    showResult('callResult', 'Please enter a phone number', 'error');
    return;
  }

  try {
    showResult('callResult', 'Initiating test call...', 'info');

    const response = await fetch(`${API_BASE}/admin/vapi/test-call`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
      }),
    });

    const data = await response.json();

    if (data.success) {
      showResult(
        'callResult',
        `✅ Test Call Initiated!\n\nCall ID: ${data.callId}\nAssistant ID: ${data.assistantId}\nPhone: ${data.phoneNumber}\nStatus: ${data.status}`,
        'success'
      );
    } else {
      showResult('callResult', `❌ Test Call Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
    }
  } catch (error) {
    showResult('callResult', `❌ Error: ${error.message}`, 'error');
  }
}

async function createColdCallAssistant() {
  const apiKey = getApiKey();

  if (!apiKey) {
    showResult('assistantResult', 'Please enter an API key first', 'error');
    return;
  }

  try {
    showResult('assistantResult', 'Creating cold call assistant...', 'info');

    const response = await fetch(`${API_BASE}/admin/vapi/cold-call-assistant`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.success) {
      showResult(
        'assistantResult',
        `✅ Cold Call Assistant Created!\n\nAssistant ID: ${data.assistant.id}\nName: ${data.assistant.name}\nStatus: ${data.assistant.status}\nCreated: ${data.assistant.createdAt}`,
        'success'
      );
    } else {
      showResult('assistantResult', `❌ Assistant Creation Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
    }
  } catch (error) {
    showResult('assistantResult', `❌ Error: ${error.message}`, 'error');
  }
}

async function testLeadData() {
  const apiKey = getApiKey();

  if (!apiKey) {
    showResult('leadDataResult', 'Please enter an API key first', 'error');
    return;
  }

  try {
    showResult('leadDataResult', 'Testing lead data quality...', 'info');

    const response = await fetch(`${API_BASE}/admin/test-lead-data`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.success) {
      const results = data.testResults;
      let message = `✅ Lead Data Quality Test Completed!\n\n`;
      message += `📊 Business Search:\n`;
      message += `  • Total Businesses: ${results.businessSearch.totalBusinesses}\n`;
      message += `  • Sample Business: ${results.businessSearch.sampleBusiness.name}\n`;
      message += `  • Phone: ${results.businessSearch.sampleBusiness.phone}\n`;
      message += `  • Email: ${results.businessSearch.sampleBusiness.email}\n`;
      message += `  • Website: ${results.businessSearch.sampleBusiness.website}\n\n`;

      if (results.decisionMakerResearch) {
        message += `👥 Decision Maker Research:\n`;
        message += `  • Total Contacts: ${results.decisionMakerResearch.contactsFound}\n`;
        message += `  • Primary: ${results.decisionMakerResearch.primaryContacts}\n`;
        message += `  • Secondary: ${results.decisionMakerResearch.secondaryContacts}\n`;
        message += `  • Gatekeeper: ${results.decisionMakerResearch.gatekeeperContacts}\n\n`;
      }

      message += `📋 Data Quality:\n`;
      message += `  • Valid Phone Numbers: ${results.dataQuality.phoneNumbersValid}/${results.businessSearch.totalBusinesses}\n`;
      message += `  • Valid Emails: ${results.dataQuality.emailsValid}/${results.businessSearch.totalBusinesses}\n`;
      message += `  • Valid Websites: ${results.dataQuality.websitesValid}/${results.businessSearch.totalBusinesses}\n`;
      message += `  • Valid Addresses: ${results.dataQuality.addressesValid}/${results.businessSearch.totalBusinesses}`;

      showResult('leadDataResult', message, 'success');
    } else {
      showResult('leadDataResult', `❌ Lead Data Test Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
    }
  } catch (error) {
    showResult('leadDataResult', `❌ Error: ${error.message}`, 'error');
  }
}

async function testScript() {
  const apiKey = getApiKey();
  const testType = document.getElementById('scriptTestType').value;

  if (!apiKey) {
    showResult('scriptResult', 'Please enter an API key first', 'error');
    return;
  }

  try {
    showResult('scriptResult', `Testing ${testType}...`, 'info');

    const requestBody = {
      testType,
    };

    if (testType === 'personalization') {
      requestBody.businessData = {
        name: 'London Dental Care',
        decisionMaker: { name: 'Dr. Sarah Johnson' },
        address: 'London, UK',
      };
    }

    const response = await fetch(`${API_BASE}/admin/test-script`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!data.success) {
      showResult('scriptResult', `❌ Script Test Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
      return;
    }

    let message = `✅ Script Test Completed!\n\n`;
    message += `Test Type: ${data.testType}\n\n`;

    if (testType === 'opening_message') {
      message += `📝 Opening Message:\n"${data.results.openingMessage}"\n\n`;
      message += `📊 Analysis:\n`;
      message += `  • Length: ${data.results.analysis.length} characters\n`;
      message += `  • Word Count: ${data.results.analysis.wordCount} words\n`;
      message += `  • Includes Value Prop: ${data.results.analysis.includesValueProposition ? '✅' : '❌'}\n`;
      message += `  • Includes Price: ${data.results.analysis.includesPrice ? '✅' : '❌'}\n`;
      message += `  • Includes Benefit: ${data.results.analysis.includesBenefit ? '✅' : '❌'}\n`;
      message += `  • Includes Time: ${data.results.analysis.includesTimeCommitment ? '✅' : '❌'}\n\n`;
      message += `💡 Recommendations:\n`;
      data.results.recommendations.forEach((rec) => {
        message += `  • ${rec}\n`;
      });
    } else if (testType === 'objection_handling') {
      message += `🎯 Objection Handling Summary:\n`;
      message += `  • Total Objections: ${data.results.summary.totalObjections}\n`;
      message += `  • Avg Response Length: ${Math.round(data.results.summary.averageResponseLength)} characters\n`;
      message += `  • All Acknowledge Concerns: ${data.results.summary.allAcknowledgeConcerns ? '✅' : '❌'}\n`;
      message += `  • All Provide Solutions: ${data.results.summary.allProvideSolutions ? '✅' : '❌'}\n\n`;
      message += `📝 Sample Responses:\n`;
      Object.entries(data.results.objections).forEach(([key, obj]) => {
        message += `  • ${key.replace('_', ' ').toUpperCase()}:\n`;
        message += `    "${obj.response}"\n\n`;
      });
    } else if (testType === 'personalization') {
      message += `🎭 Personalized Opening:\n"${data.results.personalizedOpening}"\n\n`;
      message += `📊 Personalization Analysis:\n`;
      message += `  • Uses Decision Maker Name: ${data.results.personalization.usesDecisionMakerName ? '✅' : '❌'}\n`;
      message += `  • Uses Business Name: ${data.results.personalization.usesBusinessName ? '✅' : '❌'}\n`;
      message += `  • Uses Location: ${data.results.personalization.usesLocation ? '✅' : '❌'}\n`;
      message += `  • Maintains Value Prop: ${data.results.personalization.maintainsValueProposition ? '✅' : '❌'}\n`;
      message += `  • Maintains Price: ${data.results.personalization.maintainsPrice ? '✅' : '❌'}\n`;
      message += `  • Personalization Score: ${data.results.analysis.personalizationScore}/3\n`;
    }

    showResult('scriptResult', message, 'success');
  } catch (error) {
    showResult('scriptResult', `❌ Error: ${error.message}`, 'error');
  }
}

async function validateCallDuration() {
  const apiKey = getApiKey();

  if (!apiKey) {
    showResult('durationResult', 'Please enter an API key first', 'error');
    return;
  }

  try {
    showResult('durationResult', 'Validating call duration settings...', 'info');

    const response = await fetch(`${API_BASE}/admin/validate-call-duration`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.success) {
      const validation = data.validation;
      let message = `✅ Call Duration Validation Completed!\n\n`;

      message += `⏱️ Duration Analysis:\n`;
      message += `  • Max Duration: ${validation.analysis.maxDurationMinutes} minutes\n`;
      message += `  • Total Flow Duration: ${validation.analysis.totalFlowMinutes} minutes\n`;
      message += `  • Within Optimal Range: ${validation.analysis.withinOptimalRange ? '✅' : '❌'}\n`;
      message += `  • Has End Call Phrases: ${validation.analysis.hasEndCallPhrases ? '✅' : '❌'}\n`;
      message += `  • Has End Call Message: ${validation.analysis.hasEndCallMessage ? '✅' : '❌'}\n`;
      message += `  • Includes Time Guidance: ${validation.analysis.includesTimeGuidance ? '✅' : '❌'}\n\n`;

      message += `📋 Conversation Flow Timing:\n`;
      validation.optimalTiming.conversationSteps.forEach((step) => {
        message += `  • ${step.step.replace(/([A-Z])/g, ' $1').trim()}: ${step.duration}\n`;
      });
      message += `  • Total: ${validation.analysis.totalFlowMinutes} minutes\n\n`;

      message += `💡 Recommendations:\n`;
      validation.recommendations.forEach((rec) => {
        message += `  • ${rec}\n`;
      });

      showResult('durationResult', message, 'success');
    } else {
      showResult('durationResult', `❌ Call Duration Validation Failed:\n\n${JSON.stringify(data, null, 2)}`, 'error');
    }
  } catch (error) {
    showResult('durationResult', `❌ Error: ${error.message}`, 'error');
  }
}

window.addEventListener('load', () => {
  const savedApiKey = localStorage.getItem('apiKey');
  if (savedApiKey) document.getElementById('apiKey').value = savedApiKey;
});

// Needed because index.html uses inline handlers.
window.testApiKey = testApiKey;
window.testVapiConnection = testVapiConnection;
window.makeTestCall = makeTestCall;
window.createColdCallAssistant = createColdCallAssistant;
window.testLeadData = testLeadData;
window.testScript = testScript;
window.validateCallDuration = validateCallDuration;

