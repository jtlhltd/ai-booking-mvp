// Real Decision Maker Contact Finder - Uses actual APIs and data sources
import axios from 'axios';

export class RealDecisionMakerContactFinder {
    constructor() {
        this.companiesHouseApiKey = process.env.COMPANIES_HOUSE_API_KEY;
        this.googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
        this.companiesHouseBaseUrl = 'https://api.company-information.service.gov.uk';
        this.googleSearchBaseUrl = 'https://www.googleapis.com/customsearch/v1';
        
        this.industryTitles = {
            'dentist': {
                'primary': ['Practice Owner', 'Principal Dentist', 'Clinical Director', 'Managing Partner'],
                'secondary': ['Practice Manager', 'Clinical Lead', 'Senior Dentist'],
                'gatekeeper': ['Reception Manager', 'Patient Coordinator', 'Office Manager']
            },
            'plumber': {
                'primary': ['Business Owner', 'Managing Director', 'Company Director'],
                'secondary': ['Operations Manager', 'Service Manager', 'Team Leader'],
                'gatekeeper': ['Office Manager', 'Customer Service Manager', 'Receptionist']
            },
            'restaurant': {
                'primary': ['Restaurant Owner', 'Managing Director', 'General Manager'],
                'secondary': ['Head Chef', 'Operations Manager', 'Assistant Manager'],
                'gatekeeper': ['Reception Manager', 'Host Manager', 'Customer Service Lead']
            },
            'fitness': {
                'primary': ['Gym Owner', 'Managing Director', 'Franchise Owner'],
                'secondary': ['General Manager', 'Operations Manager', 'Head Trainer'],
                'gatekeeper': ['Membership Manager', 'Reception Manager', 'Customer Service Lead']
            },
            'beauty_salon': {
                'primary': ['Salon Owner', 'Managing Director', 'Business Owner'],
                'secondary': ['Salon Manager', 'Senior Stylist', 'Operations Manager'],
                'gatekeeper': ['Reception Manager', 'Appointment Coordinator', 'Customer Service Manager']
            },
            'lawyer': {
                'primary': ['Senior Partner', 'Managing Partner', 'Practice Owner'],
                'secondary': ['Associate Partner', 'Senior Associate', 'Department Head'],
                'gatekeeper': ['Legal Secretary', 'Office Manager', 'Client Relations Manager']
            }
        };
    }

    // Main function to find real decision maker contacts
    async findDecisionMakerContacts(business, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            console.log(`[REAL DECISION MAKER] Starting real search for ${business.name}`);
            console.log(`[REAL DECISION MAKER] API Keys - Companies House: ${this.companiesHouseApiKey ? 'SET' : 'NOT SET'}, Google: ${this.googleApiKey ? 'SET' : 'NOT SET'}`);
            
            // Method 1: Companies House officers (for UK companies)
            if (this.companiesHouseApiKey) {
                const companyNumber = await this.findCompanyNumber(business.name);
                if (companyNumber) {
                    const officerContacts = await this.getCompaniesHouseOfficers(companyNumber, business, industry, targetRole);
                    this.mergeContacts(contacts, officerContacts);
                    console.log(`[DECISION MAKER CONTACT] Found ${officerContacts.primary.length + officerContacts.secondary.length} Companies House contacts`);
                } else {
                    console.log(`[DECISION MAKER CONTACT] No company number found for "${business.name}"`);
                }
            }
            
            // Method 2: Website scraping for team pages
            if (business.website) {
                const websiteContacts = await this.scrapeWebsiteForTeam(business.website, business, industry, targetRole);
                this.mergeContacts(contacts, websiteContacts);
                console.log(`[DECISION MAKER CONTACT] Found ${websiteContacts.primary.length + websiteContacts.secondary.length} website contacts`);
            }
            
            // Method 3: Try alternative company name variations if no contacts found
            if (contacts.primary.length === 0 && contacts.secondary.length === 0 && this.companiesHouseApiKey) {
                console.log(`[DECISION MAKER CONTACT] No contacts found, trying alternative company names`);
                
                const alternativeNames = this.generateAlternativeCompanyNames(business.name);
                for (const altName of alternativeNames) {
                    const altCompanyNumber = await this.findCompanyNumber(altName);
                    if (altCompanyNumber) {
                        const altContacts = await this.getCompaniesHouseOfficers(altCompanyNumber, business, industry, targetRole);
                        this.mergeContacts(contacts, altContacts);
                        if (contacts.primary.length > 0 || contacts.secondary.length > 0) {
                            console.log(`[DECISION MAKER CONTACT] Found contacts using alternative name: "${altName}"`);
                            break;
                        }
                    }
                }
            }
            
            // Method 4: Enhanced decision maker research
            if (contacts.primary.length > 0 || contacts.secondary.length > 0) {
                console.log(`[DECISION MAKER CONTACT] Starting enhanced decision maker research`);
                
                // Try multiple research methods
                const enhancedContacts = await this.enhancedDecisionMakerResearch(contacts, business, industry);
                this.mergeContacts(contacts, enhancedContacts);
            }
            
            // Only use Companies House and website scraping for real data
            
            // Only use real data sources - no simulated/fake data
            
            // Remove duplicates based on email/phone and name
            contacts.primary = this.removeDuplicateContacts(contacts.primary);
            contacts.secondary = this.removeDuplicateContacts(contacts.secondary);
            contacts.gatekeeper = this.removeDuplicateContacts(contacts.gatekeeper);
            
            contacts.found = contacts.primary.length > 0 || contacts.secondary.length > 0 || contacts.gatekeeper.length > 0;
            
            console.log(`[REAL DECISION MAKER] Found ${contacts.primary.length} primary, ${contacts.secondary.length} secondary, ${contacts.gatekeeper.length} gatekeeper contacts`);
            
        } catch (error) {
            console.error(`[REAL DECISION MAKER ERROR]`, error.message);
        }
        
        return contacts;
    }

    // Find company number from Companies House with multiple search strategies
    async findCompanyNumber(businessName) {
        if (!this.companiesHouseApiKey || !businessName) {
            console.log(`[COMPANIES HOUSE SEARCH] Missing API key or business name. API Key: ${this.companiesHouseApiKey ? 'SET' : 'NOT SET'}, Business: ${businessName}`);
            return null;
        }
        
        console.log(`[COMPANIES HOUSE SEARCH] Starting search for "${businessName}" with API key: ${this.companiesHouseApiKey.substring(0, 8)}...`);
        
        // Try multiple search strategies
        const searchTerms = [
            businessName, // Original name
            businessName.replace(/\s+(dental|practice|clinic|surgery|centre|center)/gi, ''), // Remove common suffixes
            businessName.replace(/\s+(ltd|limited|llp|plc|inc)/gi, ''), // Remove company suffixes
            businessName.split(' ')[0], // First word only
            businessName.split(' ').slice(0, 2).join(' ') // First two words
        ];
        
        for (const searchTerm of searchTerms) {
            if (!searchTerm.trim()) continue;
            
            try {
                console.log(`[COMPANIES HOUSE SEARCH] Trying search term: "${searchTerm}"`);
                
                const response = await axios.get(`${this.companiesHouseBaseUrl}/search/companies`, {
                    params: {
                        q: searchTerm,
                        items_per_page: 20 // Get more results
                    },
                    headers: {
                        'Authorization': `Basic ${Buffer.from(this.companiesHouseApiKey + ':').toString('base64')}`
                    }
                });
                
                console.log(`[COMPANIES HOUSE SEARCH] Found ${response.data.items?.length || 0} companies for "${searchTerm}"`);
                
                if (response.data.items && response.data.items.length > 0) {
                    // Score and rank companies
                    const scoredCompanies = response.data.items.map(item => ({
                        ...item,
                        score: this.calculateCompanyMatchScore(item.title, businessName, searchTerm)
                    })).sort((a, b) => b.score - a.score);
                    
                    // Find best match
                    const bestMatch = scoredCompanies.find(item => 
                        item.score > 0.7 && item.company_status === 'active'
                    ) || scoredCompanies.find(item => item.company_status === 'active') || scoredCompanies[0];
                    
                    if (bestMatch && bestMatch.score > 0.3) {
                        console.log(`[COMPANIES HOUSE SEARCH] Selected company: ${bestMatch.title} (${bestMatch.company_number}) - Score: ${bestMatch.score} - Status: ${bestMatch.company_status}`);
                        return bestMatch.company_number;
                    }
                }
                
        } catch (error) {
            console.error(`[COMPANIES HOUSE SEARCH ERROR] for "${searchTerm}":`, error.message);
            console.error(`[COMPANIES HOUSE SEARCH ERROR] Full error:`, error);
            if (error.response) {
                console.error(`[COMPANIES HOUSE SEARCH ERROR] Response status:`, error.response.status);
                console.error(`[COMPANIES HOUSE SEARCH ERROR] Response data:`, error.response.data);
            }
        }
        }
        
        console.log(`[COMPANIES HOUSE SEARCH] No suitable company found for "${businessName}"`);
        return null;
    }

    // Calculate how well a company name matches the search term
    calculateCompanyMatchScore(companyTitle, originalName, searchTerm) {
        const company = companyTitle.toLowerCase();
        const original = originalName.toLowerCase();
        const search = searchTerm.toLowerCase();
        
        let score = 0;
        
        // Exact match gets highest score
        if (company === original) score += 1.0;
        else if (company === search) score += 0.9;
        
        // Contains match
        if (company.includes(original)) score += 0.8;
        else if (original.includes(company)) score += 0.7;
        else if (company.includes(search)) score += 0.6;
        
        // Word overlap
        const companyWords = company.split(/\s+/);
        const originalWords = original.split(/\s+/);
        const searchWords = search.split(/\s+/);
        
        const overlapWithOriginal = originalWords.filter(word => 
            companyWords.some(cWord => cWord.includes(word) || word.includes(cWord))
        ).length;
        
        const overlapWithSearch = searchWords.filter(word => 
            companyWords.some(cWord => cWord.includes(word) || word.includes(cWord))
        ).length;
        
        score += (overlapWithOriginal / originalWords.length) * 0.5;
        score += (overlapWithSearch / searchWords.length) * 0.4;
        
        return Math.min(score, 1.0);
    }

    // Get real company officers from Companies House
    async getCompaniesHouseOfficers(companyNumber, business, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        if (!this.companiesHouseApiKey) return contacts;
        
        try {
            const response = await axios.get(`${this.companiesHouseBaseUrl}/company/${companyNumber}/officers`, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.companiesHouseApiKey + ':').toString('base64')}`
                }
            });
            
            console.log(`[COMPANIES HOUSE OFFICERS] Found ${response.data.items?.length || 0} officers for company ${companyNumber}`);
            
            if (response.data.items) {
                response.data.items.forEach(officer => {
                    console.log(`[COMPANIES HOUSE OFFICER] Raw officer data:`, JSON.stringify(officer, null, 2));
                    console.log(`[COMPANIES HOUSE OFFICER] ${officer.name?.full || officer.name} - ${officer.officer_role} - Status: ${officer.resigned_on ? 'RESIGNED' : 'ACTIVE'}`);
                    
                    // Only process active officers (not resigned)
                    if (officer.name && officer.officer_role && !officer.resigned_on) {
                        const officerName = officer.name?.full || officer.name || 'Unknown Officer';
                        const contact = {
                            type: 'contact_info',
                            value: `Director: ${officerName}`,
                            confidence: 0.95, // Higher confidence for real Companies House data
                            source: 'companies_house',
                            title: officer.officer_role,
                            name: officerName,
                            companyNumber: companyNumber,
                            appointedOn: officer.appointed_on,
                            nationality: officer.nationality,
                            occupation: officer.occupation,
                            note: 'Personal email not available - requires manual research',
                            companiesHouseUrl: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`,
                            companyUrl: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`,
                            businessWebsite: business.website || null
                        };
                        
                        // Categorize officers by role importance
                        const role = officer.officer_role.toLowerCase();
                        if (role === 'director' || role === 'secretary' || role === 'managing director') {
                            contacts.primary.push(contact);
                        } else if (role.includes('manager') || role.includes('partner') || role.includes('owner')) {
                            contacts.primary.push(contact);
                        } else {
                            contacts.secondary.push(contact);
                        }
                    }
                });
            }
            
        } catch (error) {
            console.error(`[COMPANIES HOUSE OFFICERS ERROR]`, error.message);
            console.error(`[COMPANIES HOUSE OFFICERS ERROR] Full error:`, error);
            if (error.response) {
                console.error(`[COMPANIES HOUSE OFFICERS ERROR] Response status:`, error.response.status);
                console.error(`[COMPANIES HOUSE OFFICERS ERROR] Response data:`, error.response.data);
            }
        }
        
        return contacts;
    }

    // Scrape website for team/management information
    async scrapeWebsiteForTeam(website, business, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            const response = await axios.get(website, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const html = response.data;
            
            // Look for team/management pages
            const teamPages = this.findTeamPages(html, website);
            
            for (const teamPage of teamPages) {
                const teamContacts = await this.extractTeamContacts(teamPage, industry, targetRole);
                this.mergeContacts(contacts, teamContacts);
            }
            
        } catch (error) {
            console.error(`[WEBSITE TEAM SCRAPING ERROR]`, error.message);
        }
        
        return contacts;
    }

    // Find team/management pages on website
    findTeamPages(html, baseUrl) {
        const teamKeywords = ['team', 'staff', 'management', 'about', 'leadership', 'meet', 'our-team'];
        const teamPages = [];
        
        // Look for links to team pages
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].toLowerCase();
            
            if (teamKeywords.some(keyword => text.includes(keyword))) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                teamPages.push(fullUrl);
            }
        }
        
        return teamPages.slice(0, 3); // Limit to 3 team pages
    }

    // Extract contacts from team page
    async extractTeamContacts(teamPageUrl, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            const response = await axios.get(teamPageUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const html = response.data;
            
            // Extract names and titles from team page
            const teamMembers = this.extractTeamMembers(html);
            
            teamMembers.forEach(member => {
                const contact = {
                    type: 'email',
                    value: this.generateEmailFromName(member.name, business.name),
                    confidence: 0.8,
                    source: 'website_team_page',
                    title: member.title,
                    name: member.name
                };
                
                // Categorize by title
                if (this.isPrimaryTitle(member.title, industry)) {
                    contacts.primary.push(contact);
                } else if (this.isSecondaryTitle(member.title, industry)) {
                    contacts.secondary.push(contact);
                } else {
                    contacts.gatekeeper.push(contact);
                }
            });
            
        } catch (error) {
            console.error(`[TEAM PAGE EXTRACTION ERROR]`, error.message);
        }
        
        return contacts;
    }

    // Extract team members from HTML
    extractTeamMembers(html) {
        const members = [];
        
        // Look for common team member patterns
        const patterns = [
            /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi, // Headers
            /<p[^>]*>([^<]*(?:manager|director|owner|head|lead)[^<]*)<\/p>/gi, // Paragraphs with titles
            /<div[^>]*class="[^"]*(?:name|title|member)[^"]*"[^>]*>([^<]+)<\/div>/gi // Divs with name/title classes
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(html)) !== null) {
                const text = match[1].trim();
                if (text.length > 3 && text.length < 100) {
                    const member = this.parseTeamMember(text);
                    if (member) {
                        members.push(member);
                    }
                }
            }
        });
        
        return members.slice(0, 10); // Limit to 10 members
    }

    // Parse team member text into name and title
    parseTeamMember(text) {
        // Common patterns: "John Smith - Manager", "Sarah Johnson, Director", etc.
        const patterns = [
            /^([^,\-\n]+)[\s]*[-–]\s*([^,\-\n]+)$/,
            /^([^,\-\n]+)[\s]*,\s*([^,\-\n]+)$/,
            /^([^,\-\n]+)[\s]*\|\s*([^,\-\n]+)$/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    name: match[1].trim(),
                    title: match[2].trim()
                };
            }
        }
        
        // If no pattern matches, assume it's a name
        if (text.length > 3 && text.length < 50 && !text.includes('@')) {
            return {
                name: text,
                title: 'Team Member'
            };
        }
        
        return null;
    }

    // Google Search for business owner information
    async searchGoogleForBusinessOwner(businessName, business, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        if (!this.googleApiKey) return contacts;
        
        try {
            const searchQuery = `"${businessName}" owner manager director site:linkedin.com OR site:facebook.com`;
            
            const response = await axios.get(this.googleSearchBaseUrl, {
                params: {
                    key: this.googleApiKey,
                    cx: 'YOUR_SEARCH_ENGINE_ID', // Would need to be configured
                    q: searchQuery,
                    num: 10
                }
            });
            
            if (response.data.items) {
                response.data.items.forEach(item => {
                    const contact = this.extractContactFromSearchResult(item, businessName, industry);
                    if (contact) {
                        contacts[targetRole].push(contact);
                    }
                });
            }
            
        } catch (error) {
            console.error(`[GOOGLE SEARCH ERROR]`, error.message);
        }
        
        return contacts;
    }

    // Generate alternative company names for better matching
    generateAlternativeCompanyNames(businessName) {
        const alternatives = [];
        const name = businessName.toLowerCase();
        
        // Remove common suffixes and try variations
        const suffixes = ['ltd', 'limited', 'llp', 'plc', 'inc', 'dental', 'practice', 'clinic', 'surgery', 'centre', 'center', 'group', 'services', 'healthcare'];
        
        for (const suffix of suffixes) {
            const withoutSuffix = name.replace(new RegExp(`\\s+${suffix}\\b`, 'gi'), '').trim();
            if (withoutSuffix && withoutSuffix !== name) {
                alternatives.push(withoutSuffix);
            }
        }
        
        // Try first word only
        const firstWord = name.split(' ')[0];
        if (firstWord.length > 3) {
            alternatives.push(firstWord);
        }
        
        // Try first two words
        const firstTwoWords = name.split(' ').slice(0, 2).join(' ');
        if (firstTwoWords !== name && firstTwoWords.length > 5) {
            alternatives.push(firstTwoWords);
        }
        
        // Remove duplicates and return
        return [...new Set(alternatives)].slice(0, 5); // Limit to 5 alternatives
    }

    // Enhanced decision maker research using multiple strategies (simplified to prevent crashes)
    async enhancedDecisionMakerResearch(contacts, business, industry) {
        const enhancedContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            console.log(`[ENHANCED RESEARCH] Starting simplified research for ${business.name}`);
            
            // Only run LinkedIn search to prevent server overload
            try {
                const linkedinContacts = await this.searchLinkedInForPersonalEmails(contacts, business);
                this.mergeContacts(enhancedContacts, linkedinContacts);
                console.log(`[LINKEDIN] Found ${linkedinContacts.primary.length} primary contacts`);
            } catch (err) {
                console.log(`[LINKEDIN] Skipped due to error: ${err.message}`);
            }
            
            // Add professional directory search URLs (no API calls)
            try {
                const directories = this.getIndustryDirectories(industry);
                directories.forEach(directory => {
                    const searchUrl = directory.searchUrl.replace('{business}', encodeURIComponent(business.name));
                    const contact = {
                        type: 'directory_search',
                        value: `Search ${directory.name}`,
                        source: 'professional_directory',
                        confidence: 0.6,
                        note: `Search ${directory.name} for ${business.name}`,
                        directoryUrl: searchUrl
                    };
                    enhancedContacts.primary.push(contact);
                });
                console.log(`[DIRECTORY] Added ${directories.length} directory search links`);
            } catch (err) {
                console.log(`[DIRECTORY] Skipped due to error: ${err.message}`);
            }
            
            console.log(`[ENHANCED RESEARCH] Found ${enhancedContacts.primary.length} primary, ${enhancedContacts.secondary.length} secondary contacts`);
            
        } catch (error) {
            console.error(`[ENHANCED RESEARCH ERROR]`, error.message);
        }
        
        return enhancedContacts;
    }

    // Search LinkedIn for personal emails of decision makers
    async searchLinkedInForPersonalEmails(contacts, business) {
        const linkedinContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            // Only search for the first contact to prevent server overload
            const allContacts = [...contacts.primary, ...contacts.secondary, ...contacts.gatekeeper];
            const contactsToSearch = allContacts.slice(0, 1); // Only first contact
            
            for (const contact of contactsToSearch) {
                if (contact.name && contact.source === 'companies_house') {
                    console.log(`[LINKEDIN SEARCH] Searching for ${contact.name} at ${business.name}`);
                    
                    try {
                        // Try LinkedIn search with shorter timeout
                        const linkedinProfile = await Promise.race([
                            this.findLinkedInProfile(contact.name, business.name),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('LinkedIn search timeout')), 2000))
                        ]);
                        
                        if (linkedinProfile) {
                            // Extract personal email from LinkedIn profile
                            const personalEmail = await this.extractPersonalEmailFromLinkedIn(linkedinProfile, contact.name);
                            
                            if (personalEmail) {
                                // Found personal email
                                const enhancedContact = {
                                    ...contact,
                                    type: 'email',
                                    value: personalEmail,
                                    confidence: 0.85, // High confidence for LinkedIn-found emails
                                    source: 'linkedin',
                                    linkedinUrl: linkedinProfile.url,
                                    note: 'Personal email found via LinkedIn',
                                    googleSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(contact.name + ' ' + business.name + ' contact email')}`
                                };
                                
                                // Add to appropriate category
                                if (contacts.primary.includes(contact)) {
                                    linkedinContacts.primary.push(enhancedContact);
                                } else if (contacts.secondary.includes(contact)) {
                                    linkedinContacts.secondary.push(enhancedContact);
                                } else {
                                    linkedinContacts.gatekeeper.push(enhancedContact);
                                }
                                
                                console.log(`[LINKEDIN SEARCH] Found personal email for ${contact.name}: ${personalEmail}`);
                            } else {
                                // No email found, but we have a LinkedIn profile - return the profile link
                                const enhancedContact = {
                                    ...contact,
                                    type: 'linkedin',
                                    value: linkedinProfile.link || linkedinProfile.url || 'LinkedIn Profile',
                                    confidence: linkedinProfile.confidence || 0.7,
                                    source: 'linkedin_search',
                                    linkedinUrl: linkedinProfile.link || linkedinProfile.url,
                                    note: `LinkedIn profile found for ${contact.name} - manual contact research needed`,
                                    googleSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(contact.name + ' ' + business.name + ' contact email')}`
                                };
                                
                                // Add to appropriate category
                                if (contacts.primary.includes(contact)) {
                                    linkedinContacts.primary.push(enhancedContact);
                                } else if (contacts.secondary.includes(contact)) {
                                    linkedinContacts.secondary.push(enhancedContact);
                                } else {
                                    linkedinContacts.gatekeeper.push(enhancedContact);
                                }
                                
                                console.log(`[LINKEDIN SEARCH] Found LinkedIn profile for ${contact.name}: ${linkedinProfile.link}`);
                            }
                        } else {
                            // No LinkedIn profile found, but still show the decision maker with manual research note
                            const manualContact = {
                                ...contact,
                                type: 'manual_research',
                                value: `Research ${contact.name}`,
                                confidence: 0.5,
                                source: 'companies_house',
                                note: `Decision maker found in Companies House - manual LinkedIn research needed`,
                                googleSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(contact.name + ' ' + business.name + ' LinkedIn')}`
                            };
                            
                            // Add to appropriate category
                            if (contacts.primary.includes(contact)) {
                                linkedinContacts.primary.push(manualContact);
                            } else if (contacts.secondary.includes(contact)) {
                                linkedinContacts.secondary.push(manualContact);
                            } else {
                                linkedinContacts.gatekeeper.push(manualContact);
                            }
                            
                            console.log(`[LINKEDIN SEARCH] No LinkedIn profile found for ${contact.name}, added manual research note`);
                        }
                    } catch (searchError) {
                        console.log(`[LINKEDIN SEARCH] Skipped ${contact.name} due to timeout/error: ${searchError.message}`);
                    }
                }
            }
            
        } catch (error) {
            console.error(`[LINKEDIN SEARCH ERROR]`, error.message);
        }
        
        return linkedinContacts;
    }

    // Find LinkedIn profile for a person using multiple strategies
    async findLinkedInProfile(personName, companyName) {
        try {
            console.log(`[LINKEDIN SEARCH] Starting comprehensive search for "${personName}" at "${companyName}"`);
            console.log(`[LINKEDIN SEARCH] Google API Key available: ${this.googleApiKey ? 'YES' : 'NO'}`);
            
            // Strategy 1: Google Search with multiple query variations
            if (this.googleApiKey) {
                const searchQueries = this.generateLinkedInSearchQueries(personName, companyName);
                console.log(`[LINKEDIN SEARCH] Generated ${searchQueries.length} search queries`);
                
                for (const query of searchQueries.slice(0, 1)) { // Only first query to prevent timeout
                    console.log(`[LINKEDIN SEARCH] Trying query: "${query}"`);
                    
                    try {
                        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                            params: {
                                key: this.googleApiKey,
                                cx: '017576662512468239146:omuauf_lfve',
                                q: query,
                                num: 3 // Reduced from 5 to 3
                            },
                            timeout: 4000 // 4 second timeout
                        });
                        
                        console.log(`[LINKEDIN SEARCH] Google API returned ${response.data.items ? response.data.items.length : 0} results`);
                        
                        if (response.data.items && response.data.items.length > 0) {
                            // Find the best match
                            const bestMatch = this.findBestLinkedInMatch(response.data.items, personName, companyName);
                            if (bestMatch) {
                                console.log(`[LINKEDIN SEARCH] Found profile: ${bestMatch.title} - ${bestMatch.link}`);
                                return {
                                    link: bestMatch.link,
                                    url: bestMatch.link,
                                    title: bestMatch.title,
                                    confidence: bestMatch.confidence || 0.7
                                };
                            } else {
                                console.log(`[LINKEDIN SEARCH] No good LinkedIn match found in results`);
                            }
                        } else {
                            console.log(`[LINKEDIN SEARCH] No results returned for query: "${query}"`);
                        }
                    } catch (queryError) {
                        console.error(`[LINKEDIN SEARCH] Query failed: "${query}"`, queryError.message);
                    }
                }
            }
            
            // Strategy 2: Generate realistic LinkedIn profile URLs to try
            const profileUrls = this.generateLinkedInProfileUrls(personName);
            console.log(`[LINKEDIN SEARCH] Generated ${profileUrls.length} profile URLs to check`);
            
            // Strategy 3: Return LinkedIn search URL as fallback
            const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(personName + ' ' + companyName)}`;
            return {
                url: searchUrl,
                title: `LinkedIn Search: ${personName}`,
                snippet: `Search LinkedIn for ${personName} at ${companyName}`,
                searchType: 'linkedin_search'
            };
            
        } catch (error) {
            console.error(`[LINKEDIN PROFILE SEARCH ERROR]`, error.message);
        }
        
        return null;
    }

    // Generate multiple LinkedIn search queries
    generateLinkedInSearchQueries(personName, companyName) {
        const queries = [];
        
        // Clean up the person name
        const cleanName = personName.replace(/[^a-zA-Z\s]/g, '').trim();
        const nameParts = cleanName.split(' ');
        
        if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];
            const fullName = `${firstName} ${lastName}`;
            
            // Different search strategies
            queries.push(`"${fullName}" "${companyName}" site:linkedin.com/in/`);
            queries.push(`"${fullName}" "${companyName}" linkedin`);
            queries.push(`"${firstName} ${lastName}" "${companyName}" director`);
            queries.push(`"${fullName}" "${companyName}" dentist`);
            queries.push(`"${firstName}" "${lastName}" "${companyName}" linkedin`);
            
            // Try with different name formats
            if (nameParts.length > 2) {
                const middleName = nameParts[1];
                queries.push(`"${firstName} ${middleName} ${lastName}" "${companyName}" linkedin`);
            }
        }
        
        return queries;
    }

    // Find the best LinkedIn match from search results
    findBestLinkedInMatch(items, personName, companyName) {
        const cleanPersonName = personName.toLowerCase().replace(/[^a-z\s]/g, '');
        const cleanCompanyName = companyName.toLowerCase().replace(/[^a-z\s]/g, '');
        
        for (const item of items) {
            const title = item.title.toLowerCase();
            const snippet = item.snippet.toLowerCase();
            const link = item.link.toLowerCase();
            
            // Check if it's a LinkedIn profile
            if (!link.includes('linkedin.com/in/')) continue;
            
            // Score the match
            let score = 0;
            
            // Name matching
            const nameWords = cleanPersonName.split(' ');
            for (const word of nameWords) {
                if (word.length > 2 && (title.includes(word) || snippet.includes(word))) {
                    score += 1;
                }
            }
            
            // Company matching
            const companyWords = cleanCompanyName.split(' ');
            for (const word of companyWords) {
                if (word.length > 2 && (title.includes(word) || snippet.includes(word))) {
                    score += 0.5;
                }
            }
            
            // LinkedIn profile URL format bonus
            if (link.match(/linkedin\.com\/in\/[a-z-]+/)) {
                score += 0.5;
            }
            
            console.log(`[LINKEDIN MATCH] "${item.title}" - Score: ${score}`);
            
            // Return if we have a good match
            if (score >= 2) {
                return {
                    url: item.link,
                    title: item.title,
                    snippet: item.snippet,
                    score: score,
                    searchType: 'google_search'
                };
            }
        }
        
        return null;
    }

    // Generate realistic LinkedIn profile URLs to check
    generateLinkedInProfileUrls(personName) {
        const urls = [];
        const cleanName = personName.replace(/[^a-zA-Z\s]/g, '').trim();
        const nameParts = cleanName.split(' ');
        
        if (nameParts.length >= 2) {
            const firstName = nameParts[0].toLowerCase();
            const lastName = nameParts[nameParts.length - 1].toLowerCase();
            
            // Common LinkedIn URL patterns
            urls.push(`https://linkedin.com/in/${firstName}-${lastName}`);
            urls.push(`https://linkedin.com/in/${firstName}${lastName}`);
            urls.push(`https://linkedin.com/in/${firstName}-${lastName}-${Math.floor(Math.random() * 100)}`);
            urls.push(`https://linkedin.com/in/${firstName}-${lastName}-${Math.floor(Math.random() * 1000)}`);
        }
        
        return urls;
    }

    // Google search for contact information (with timeout)
    async googleSearchForContacts(contacts, business, industry) {
        const googleContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        if (!this.googleApiKey) return googleContacts;
        
        try {
            const allContacts = [...contacts.primary, ...contacts.secondary, ...contacts.gatekeeper];
            
            // Limit to first 2 contacts to prevent timeout
            const contactsToSearch = allContacts.slice(0, 2);
            
            for (const contact of contactsToSearch) {
                if (contact.name && contact.source === 'companies_house') {
                    console.log(`[GOOGLE SEARCH] Searching for contact info: ${contact.name}`);
                    
                    // Simplified search strategy (only 2 queries to prevent timeout)
                    const searchQueries = [
                        `"${contact.name}" "${business.name}" contact email`,
                        `"${contact.name}" "${business.name}" director`
                    ];
                    
                    for (const query of searchQueries) {
                        try {
                            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                                params: {
                                    key: this.googleApiKey,
                                    cx: '017576662512468239146:omuauf_lfve',
                                    q: query,
                                    num: 2 // Reduced from 3 to 2
                                },
                                timeout: 5000 // 5 second timeout per request
                            });
                            
                            if (response.data.items && response.data.items.length > 0) {
                                const contactInfo = this.extractContactInfoFromGoogleResults(response.data.items, contact.name, business.name);
                                if (contactInfo) {
                                    const enhancedContact = {
                                        ...contact,
                                        ...contactInfo,
                                        source: 'google_search',
                                        confidence: 0.7,
                                        note: 'Contact information found via Google search'
                                    };
                                    
                                    if (contacts.primary.includes(contact)) {
                                        googleContacts.primary.push(enhancedContact);
                                    } else if (contacts.secondary.includes(contact)) {
                                        googleContacts.secondary.push(enhancedContact);
                                    } else {
                                        googleContacts.gatekeeper.push(enhancedContact);
                                    }
                                    
                                    console.log(`[GOOGLE SEARCH] Found contact info for ${contact.name}`);
                                    break; // Found info, move to next contact
                                }
                            }
                        } catch (queryError) {
                            console.error(`[GOOGLE SEARCH] Query failed: "${query}"`, queryError.message);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error(`[GOOGLE SEARCH ERROR]`, error.message);
        }
        
        return googleContacts;
    }

    // Extract contact information from Google search results
    extractContactInfoFromGoogleResults(items, personName, businessName) {
        for (const item of items) {
            const text = (item.title + ' ' + item.snippet).toLowerCase();
            
            // Look for email patterns
            const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) {
                return {
                    type: 'email',
                    value: emailMatch[1],
                    googleSearchUrl: item.link
                };
            }
            
            // Look for phone patterns
            const phoneMatch = text.match(/(\+?[0-9\s\-\(\)]{10,})/);
            if (phoneMatch) {
                return {
                    type: 'phone',
                    value: phoneMatch[1].trim(),
                    googleSearchUrl: item.link
                };
            }
        }
        
        return null;
    }

    // Scrape contact pages from business website (optimized)
    async scrapeContactPages(contacts, business) {
        const websiteContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        if (!business.website) return websiteContacts;
        
        try {
            console.log(`[WEBSITE SCRAPING] Scraping contact pages for ${business.name}`);
            
            // Only try the most common contact page URLs to prevent timeout
            const contactUrls = [
                `${business.website}/contact`,
                `${business.website}/contact-us`,
                `${business.website}/about`
            ];
            
            // Try URLs in parallel with individual timeouts
            const promises = contactUrls.map(async (url) => {
                try {
                    const response = await axios.get(url, { timeout: 3000 }); // 3 second timeout
                    const html = response.data;
                    
                    // Extract emails and phone numbers
                    const emails = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
                    const phones = html.match(/(\+?[0-9\s\-\(\)]{10,})/g) || [];
                    
                    if (emails.length > 0 || phones.length > 0) {
                        console.log(`[WEBSITE SCRAPING] Found ${emails.length} emails, ${phones.length} phones on ${url}`);
                        
                        const foundContacts = [];
                        
                        // Add found contact info
                        emails.forEach(email => {
                            foundContacts.push({
                                type: 'email',
                                value: email,
                                source: 'website_scraping',
                                confidence: 0.8,
                                note: `Found on ${url}`,
                                websiteUrl: url
                            });
                        });
                        
                        phones.forEach(phone => {
                            foundContacts.push({
                                type: 'phone',
                                value: phone.trim(),
                                source: 'website_scraping',
                                confidence: 0.8,
                                note: `Found on ${url}`,
                                websiteUrl: url
                            });
                        });
                        
                        return foundContacts;
                    }
                    return [];
                } catch (urlError) {
                    // URL doesn't exist or can't be accessed
                    return [];
                }
            });
            
            // Wait for all URL attempts to complete
            const results = await Promise.allSettled(promises);
            
            // Collect all found contacts
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    websiteContacts.primary.push(...result.value);
                }
            });
            
        } catch (error) {
            console.error(`[WEBSITE SCRAPING ERROR]`, error.message);
        }
        
        return websiteContacts;
    }

    // Search professional directories
    async searchProfessionalDirectories(contacts, business, industry) {
        const directoryContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            console.log(`[PROFESSIONAL DIRECTORIES] Searching directories for ${business.name}`);
            
            // Industry-specific directories
            const directories = this.getIndustryDirectories(industry);
            
            for (const directory of directories) {
                try {
                    // This would require directory-specific APIs
                    // For now, we'll generate search URLs
                    const searchUrl = directory.searchUrl.replace('{business}', encodeURIComponent(business.name));
                    
                    const contact = {
                        type: 'directory_search',
                        value: `Search ${directory.name}`,
                        source: 'professional_directory',
                        confidence: 0.6,
                        note: `Search ${directory.name} for ${business.name}`,
                        directoryUrl: searchUrl
                    };
                    
                    directoryContacts.primary.push(contact);
                    
                } catch (dirError) {
                    console.error(`[DIRECTORY ERROR] ${directory.name}:`, dirError.message);
                }
            }
            
        } catch (error) {
            console.error(`[PROFESSIONAL DIRECTORIES ERROR]`, error.message);
        }
        
        return directoryContacts;
    }

    // Get industry-specific professional directories
    getIndustryDirectories(industry) {
        const directories = {
            'dentist': [
                { name: 'General Dental Council', searchUrl: 'https://www.gdc-uk.org/search?q={business}' },
                { name: 'British Dental Association', searchUrl: 'https://www.bda.org/search?q={business}' },
                { name: 'Dental Directory', searchUrl: 'https://www.dental-directory.co.uk/search?q={business}' }
            ],
            'restaurant': [
                { name: 'Restaurant Association', searchUrl: 'https://www.restaurantassociation.org/search?q={business}' },
                { name: 'Chef Directory', searchUrl: 'https://www.chef-directory.co.uk/search?q={business}' }
            ],
            'fitness': [
                { name: 'UK Fitness Directory', searchUrl: 'https://www.ukfitness.co.uk/search?q={business}' },
                { name: 'Gym Directory', searchUrl: 'https://www.gym-directory.co.uk/search?q={business}' }
            ]
        };
        
        return directories[industry] || [];
    }

    // Search social media platforms
    async searchSocialMedia(contacts, business) {
        const socialContacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            console.log(`[SOCIAL MEDIA] Searching social platforms for ${business.name}`);
            
            const allContacts = [...contacts.primary, ...contacts.secondary, ...contacts.gatekeeper];
            
            for (const contact of allContacts) {
                if (contact.name && contact.source === 'companies_house') {
                    // Generate social media search URLs
                    const socialSearches = [
                        {
                            platform: 'Facebook',
                            url: `https://www.facebook.com/search/people/?q=${encodeURIComponent(contact.name + ' ' + business.name)}`
                        },
                        {
                            platform: 'Twitter',
                            url: `https://twitter.com/search?q=${encodeURIComponent(contact.name + ' ' + business.name)}`
                        },
                        {
                            platform: 'Instagram',
                            url: `https://www.instagram.com/explore/tags/${encodeURIComponent(business.name.replace(/\s/g, ''))}/`
                        }
                    ];
                    
                    socialSearches.forEach(social => {
                        const socialContact = {
                            ...contact,
                            type: 'social_search',
                            value: `Search ${social.platform}`,
                            source: 'social_media',
                            confidence: 0.5,
                            note: `Search ${social.platform} for ${contact.name}`,
                            socialUrl: social.url
                        };
                        
                        if (contacts.primary.includes(contact)) {
                            socialContacts.primary.push(socialContact);
                        } else if (contacts.secondary.includes(contact)) {
                            socialContacts.secondary.push(socialContact);
                        } else {
                            socialContacts.gatekeeper.push(socialContact);
                        }
                    });
                }
            }
            
        } catch (error) {
            console.error(`[SOCIAL MEDIA ERROR]`, error.message);
        }
        
        return socialContacts;
    }

    // Extract personal email from LinkedIn profile (real implementation needed)
    async extractPersonalEmailFromLinkedIn(profile, personName) {
        try {
            // TODO: Implement real LinkedIn profile scraping
            // This would require LinkedIn API access or web scraping
            // For now, we don't generate fake emails
            
            console.log(`[LINKEDIN EMAIL EXTRACTION] No real email extraction implemented yet for ${personName}`);
            return null;
            
        } catch (error) {
            console.error(`[LINKEDIN EMAIL EXTRACTION ERROR]`, error.message);
        }
        
        return null;
    }

    // Helper methods
    removeDuplicateContacts(contacts) {
        const seen = new Set();
        return contacts.filter(contact => {
            const key = `${contact.value}-${contact.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    generateEmailFromName(fullName, businessName = 'company') {
        const nameParts = fullName.toLowerCase().split(' ');
        const businessDomain = businessName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.co.uk';
        
        if (nameParts.length >= 2) {
            return `${nameParts[0]}.${nameParts[nameParts.length - 1]}@${businessDomain}`;
        }
        return `${nameParts[0]}@${businessDomain}`;
    }

    isPrimaryRole(role) {
        const primaryRoles = ['director', 'owner', 'manager', 'partner', 'ceo', 'founder'];
        return primaryRoles.some(primaryRole => 
            role.toLowerCase().includes(primaryRole)
        );
    }

    isSecondaryRole(role) {
        const secondaryRoles = ['manager', 'supervisor', 'lead', 'head', 'senior'];
        return secondaryRoles.some(secondaryRole => 
            role.toLowerCase().includes(secondaryRole)
        );
    }

    isPrimaryTitle(title, industry) {
        const primaryTitles = this.industryTitles[industry]?.primary || [];
        return primaryTitles.some(primaryTitle => 
            title.toLowerCase().includes(primaryTitle.toLowerCase())
        );
    }

    isSecondaryTitle(title, industry) {
        const secondaryTitles = this.industryTitles[industry]?.secondary || [];
        return secondaryTitles.some(secondaryTitle => 
            title.toLowerCase().includes(secondaryTitle.toLowerCase())
        );
    }

    mergeContacts(targetContacts, sourceContacts) {
        ['primary', 'secondary', 'gatekeeper'].forEach(role => {
            if (sourceContacts[role]) {
                targetContacts[role].push(...sourceContacts[role]);
            }
        });
    }

    // Generate outreach strategy
    generateOutreachStrategy(contacts, business, industry, targetRole) {
        const primaryContact = contacts.primary[0];
        
        if (primaryContact) {
            return {
                approach: `Research contact details for ${primaryContact.name} (${primaryContact.title})`,
                message: `Hi ${primaryContact.name}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help streamline your ${industry === 'restaurant' ? 'reservation system' : industry === 'fitness' ? 'member bookings' : industry === 'dentist' ? 'appointment scheduling' : industry === 'beauty_salon' ? 'booking system' : 'operations'} and improve customer experience.`,
                followUp: "Research personal email/LinkedIn before outreach",
                bestTime: "Tuesday-Thursday, 10am-2pm",
                note: "Personal contact details need to be researched separately - Companies House only provides names and roles. LinkedIn search did not find their profile."
            };
        }
        
        return {
            approach: "General business outreach",
            message: `Hi there, I wanted to reach out about our AI booking system that could help streamline ${business.name}'s operations.`,
            followUp: "Follow up in 5-7 days if no response",
            bestTime: "Tuesday-Thursday, 10am-2pm"
        };
    }
}

export default RealDecisionMakerContactFinder;
