// Advanced Contact Research System
import axios from 'axios';

class AdvancedContactResearch {
  constructor() {
    this.apiKeys = {
      linkedin: process.env.LINKEDIN_API_KEY,
      hunter: process.env.HUNTER_API_KEY,
      clearbit: process.env.CLEARBIT_API_KEY
    };
  }

  async findDecisionMakerContacts(business, industry, targetRole) {
    const results = {
      primary: [],
      secondary: [],
      gatekeeper: [],
      strategy: null
    };

    // Parallel contact research
    const contactMethods = await Promise.allSettled([
      this.searchLinkedIn(business, industry, targetRole),
      this.scrapeWebsite(business.website, targetRole),
      this.searchCompaniesHouseOfficers(business.companyNumber, targetRole),
      this.searchGoogleContacts(business.name, targetRole, industry),
      this.verifyEmails(business.email, business.name)
    ]);

    // Process results
    contactMethods.forEach((method, index) => {
      if (method.status === 'fulfilled' && method.value) {
        const contacts = method.value;
        this.categorizeContacts(contacts, results);
      }
    });

    // Generate outreach strategy
    results.strategy = this.generateOutreachStrategy(results, business, industry, targetRole);

    return results;
  }

  async searchLinkedIn(business, industry, targetRole) {
    if (!this.apiKeys.linkedin) {
      console.log('[LINKEDIN] No API key provided');
      return this.simulateLinkedInSearch(business, industry, targetRole);
    }

    try {
      const searchQuery = `${targetRole} ${business.name} ${industry}`;
      const url = `https://api.linkedin.com/v2/people-search?keywords=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKeys.linkedin}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return response.data.elements.map(person => ({
        type: 'email',
        value: person.emailAddress || this.generateLinkedInEmail(person),
        confidence: 0.8,
        source: 'linkedin',
        title: person.headline || targetRole,
        profileUrl: person.publicProfileUrl,
        connections: person.connectionsCount,
        industry: person.industry,
        location: person.location?.name
      }));
    } catch (error) {
      console.error('[LINKEDIN] Error:', error.message);
      return this.simulateLinkedInSearch(business, industry, targetRole);
    }
  }

  async scrapeWebsite(website, targetRole) {
    if (!website) return [];

    try {
      const response = await axios.get(website, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const html = response.data;
      const contacts = [];

      // Extract emails
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = html.match(emailRegex) || [];

      // Extract phone numbers
      const phoneRegex = /(?:\+44|0)[0-9]{10,11}/g;
      const phones = html.match(phoneRegex) || [];

      // Extract team member information
      const teamRegex = /<[^>]*class="[^"]*(?:team|staff|about)[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi;
      const teamMatches = html.match(teamRegex) || [];

      emails.forEach(email => {
        if (this.isDecisionMakerEmail(email, targetRole)) {
          contacts.push({
            type: 'email',
            value: email,
            confidence: 0.9,
            source: 'website_scraping',
            title: this.extractTitleFromEmail(email, targetRole)
          });
        }
      });

      phones.forEach(phone => {
        contacts.push({
          type: 'phone',
          value: phone,
          confidence: 0.8,
          source: 'website_scraping',
          title: 'Main Contact'
        });
      });

      return contacts;
    } catch (error) {
      console.error('[WEBSITE SCRAPING] Error:', error.message);
      return [];
    }
  }

  async searchCompaniesHouseOfficers(companyNumber, targetRole) {
    if (!companyNumber || !this.apiKeys.companiesHouse) return [];

    try {
      const url = `https://api.company-information.service.gov.uk/company/${companyNumber}/officers`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
        }
      });

      const officers = response.data.items || [];

      return officers
        .filter(officer => this.isRelevantOfficer(officer, targetRole))
        .map(officer => ({
          type: 'email',
          value: this.generateOfficerEmail(officer),
          confidence: 0.7,
          source: 'companies_house',
          title: officer.officer_role,
          name: officer.name,
          nationality: officer.nationality,
          occupation: officer.occupation,
          dateOfBirth: officer.date_of_birth
        }));
    } catch (error) {
      console.error('[COMPANIES HOUSE OFFICERS] Error:', error.message);
      return [];
    }
  }

  async searchGoogleContacts(businessName, targetRole, industry) {
    try {
      const searchQueries = [
        `"${businessName}" "${targetRole}" email contact`,
        `"${businessName}" "${targetRole}" linkedin`,
        `"${businessName}" contact information "${targetRole}"`,
        `site:${businessName.toLowerCase().replace(/\s+/g, '')}.co.uk "${targetRole}"`
      ];

      const contacts = [];

      for (const query of searchQueries) {
        try {
          const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
            params: {
              key: process.env.GOOGLE_SEARCH_API_KEY,
              cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
              q: query,
              num: 5
            }
          });

          const results = response.data.items || [];
          
          results.forEach(result => {
            const emailMatches = result.snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (emailMatches) {
              emailMatches.forEach(email => {
                contacts.push({
                  type: 'email',
                  value: email,
                  confidence: 0.6,
                  source: 'google_search',
                  title: targetRole,
                  url: result.link,
                  snippet: result.snippet
                });
              });
            }
          });
        } catch (error) {
          console.error(`[GOOGLE SEARCH] Error for query "${query}":`, error.message);
        }
      }

      return contacts;
    } catch (error) {
      console.error('[GOOGLE CONTACTS] Error:', error.message);
      return [];
    }
  }

  async verifyEmails(email, businessName) {
    if (!email || !this.apiKeys.hunter) return [];

    try {
      const response = await axios.get(`https://api.hunter.io/v2/email-verifier`, {
        params: {
          email: email,
          api_key: this.apiKeys.hunter
        }
      });

      const verification = response.data.data;

      return [{
        type: 'email',
        value: email,
        confidence: verification.score / 100,
        source: 'email_verification',
        title: 'Verified Email',
        deliverability: verification.result,
        score: verification.score,
        sources: verification.sources
      }];
    } catch (error) {
      console.error('[EMAIL VERIFICATION] Error:', error.message);
      return [];
    }
  }

  // Helper methods
  categorizeContacts(contacts, results) {
    contacts.forEach(contact => {
      if (contact.confidence >= 0.8) {
        results.primary.push(contact);
      } else if (contact.confidence >= 0.6) {
        results.secondary.push(contact);
      } else {
        results.gatekeeper.push(contact);
      }
    });
  }

  generateOutreachStrategy(contacts, business, industry, targetRole) {
    const strategies = {
      dental: {
        approach: "Direct outreach focusing on appointment efficiency",
        message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help reduce no-shows and streamline your appointment scheduling.`,
        followUp: "Follow up in 3-5 days if no response",
        bestTime: "Tuesday-Thursday, 10am-2pm",
        channels: this.recommendChannels(contacts)
      },
      legal: {
        approach: "Professional outreach emphasizing time management",
        message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help optimize your client consultation scheduling.`,
        followUp: "Follow up in 5-7 days if no response",
        bestTime: "Monday-Wednesday, 9am-11am",
        channels: this.recommendChannels(contacts)
      },
      beauty: {
        approach: "Friendly outreach focusing on customer experience",
        message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help improve your customer booking experience and reduce cancellations.`,
        followUp: "Follow up in 3-4 days if no response",
        bestTime: "Tuesday-Thursday, 11am-3pm",
        channels: this.recommendChannels(contacts)
      },
      default: {
        approach: "Direct outreach to decision maker",
        message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help streamline your appointment scheduling.`,
        followUp: "Follow up in 3-5 days if no response",
        bestTime: "Tuesday-Thursday, 10am-2pm",
        channels: this.recommendChannels(contacts)
      }
    };

    return strategies[industry] || strategies.default;
  }

  recommendChannels(contacts) {
    const channels = [];
    
    if (contacts.primary.some(c => c.type === 'email')) {
      channels.push('Email (Primary)');
    }
    if (contacts.secondary.some(c => c.type === 'phone')) {
      channels.push('Phone (Secondary)');
    }
    if (contacts.primary.some(c => c.source === 'linkedin')) {
      channels.push('LinkedIn (Professional)');
    }
    
    return channels.length > 0 ? channels : ['Email', 'Phone'];
  }

  simulateLinkedInSearch(business, industry, targetRole) {
    return [{
      type: 'email',
      value: `${targetRole.toLowerCase().replace(/\s+/g, '.')}@${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
      confidence: 0.7,
      source: 'linkedin_simulation',
      title: targetRole,
      profileUrl: `https://linkedin.com/in/${targetRole.toLowerCase().replace(/\s+/g, '-')}-${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      connections: Math.floor(Math.random() * 500) + 100
    }];
  }

  isDecisionMakerEmail(email, targetRole) {
    const roleKeywords = targetRole.toLowerCase().split(' ');
    const emailLower = email.toLowerCase();
    
    return roleKeywords.some(keyword => 
      emailLower.includes(keyword) || 
      emailLower.includes(keyword.substring(0, 3))
    );
  }

  extractTitleFromEmail(email, targetRole) {
    const emailLower = email.toLowerCase();
    if (emailLower.includes('manager')) return 'Manager';
    if (emailLower.includes('director')) return 'Director';
    if (emailLower.includes('owner')) return 'Owner';
    return targetRole;
  }

  isRelevantOfficer(officer, targetRole) {
    const role = officer.officer_role.toLowerCase();
    const targetRoleLower = targetRole.toLowerCase();
    
    return role.includes('director') || 
           role.includes('manager') || 
           role.includes(targetRoleLower.split(' ')[0]);
  }

  generateOfficerEmail(officer) {
    const name = officer.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
    return `${name}@company.co.uk`;
  }

  generateLinkedInEmail(person) {
    const name = person.name?.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.') || 'contact';
    return `${name}@linkedin.com`;
  }
}

export default AdvancedContactResearch;
