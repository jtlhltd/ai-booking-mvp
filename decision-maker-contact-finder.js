// Decision Maker Contact Finder - Find actual decision maker contact details
import axios from 'axios';

export class DecisionMakerContactFinder {
    constructor() {
        this.decisionMakerPatterns = {
            // Email patterns for decision makers
            email: {
                primary: [
                    'owner@', 'manager@', 'director@', 'principal@',
                    'ceo@', 'founder@', 'head@', 'lead@', 'senior@',
                    'practice.manager@', 'practice.owner@', 'clinic.manager@',
                    'salon.manager@', 'gym.manager@', 'studio.manager@'
                ],
                secondary: [
                    'admin@', 'office@', 'reception@', 'info@',
                    'contact@', 'enquiries@', 'bookings@', 'appointments@'
                ],
                gatekeeper: [
                    'reception@', 'receptionist@', 'admin@', 'office@',
                    'info@', 'contact@', 'enquiries@'
                ]
            },
            
            // Phone number patterns (usually main business line)
            phone: {
                primary: 'Main business line (usually decision maker)',
                secondary: 'Direct line or extension',
                gatekeeper: 'Reception or main switchboard'
            },
            
            // Website sections to check for decision maker info
            website: {
                about: ['about', 'about-us', 'team', 'staff', 'leadership', 'management'],
                contact: ['contact', 'contact-us', 'get-in-touch', 'reach-us'],
                team: ['team', 'our-team', 'meet-the-team', 'staff', 'leadership']
            }
        };
        
        this.contactExtractionMethods = [
            'website_scraping',
            'linkedin_search',
            'companies_house_officers',
            'google_search',
            'social_media_search'
        ];
    }
    
    // Main function to find decision maker contacts
    async findDecisionMakerContacts(business, industry, targetRole) {
        console.log(`[DECISION MAKER CONTACT] Finding contacts for ${targetRole} at ${business.name}`);
        
        const contacts = {
            primary: [],
            secondary: [],
            gatekeeper: [],
            found: false
        };
        
        try {
            // Method 1: Extract from website
            if (business.website) {
                const websiteContacts = await this.extractContactsFromWebsite(business.website, industry, targetRole);
                this.mergeContacts(contacts, websiteContacts);
            }
            
            // Method 2: Companies House officers (for UK companies)
            if (business.companyNumber) {
                const officerContacts = await this.extractContactsFromOfficers(business.companyNumber, industry, targetRole);
                this.mergeContacts(contacts, officerContacts);
            }
            
            // Method 3: LinkedIn search
            const linkedinContacts = await this.searchLinkedInContacts(business.name, industry, targetRole);
            this.mergeContacts(contacts, linkedinContacts);
            
            // Method 4: Google search for decision maker
            const googleContacts = await this.searchGoogleForDecisionMaker(business.name, industry, targetRole);
            this.mergeContacts(contacts, googleContacts);
            
            contacts.found = contacts.primary.length > 0 || contacts.secondary.length > 0 || contacts.gatekeeper.length > 0;
            
            console.log(`[DECISION MAKER CONTACT] Found ${contacts.primary.length} primary, ${contacts.secondary.length} secondary, ${contacts.gatekeeper.length} gatekeeper contacts`);
            
            return contacts;
        } catch (error) {
            console.error('[DECISION MAKER CONTACT ERROR]', error);
            return contacts;
        }
    }
    
    // Extract contacts from business website
    async extractContactsFromWebsite(website, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            const response = await axios.get(website, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const html = response.data;
            
            // Extract all emails from the website
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const emails = html.match(emailRegex) || [];
            
            // Extract all phone numbers
            const phoneRegex = /(?:\+44|0)[0-9\s\-\(\)]{10,15}/g;
            const phones = html.match(phoneRegex) || [];
            
            // Categorize emails by decision maker patterns
            emails.forEach(email => {
                const emailLower = email.toLowerCase();
                const contact = {
                    type: 'email',
                    value: email,
                    source: 'website',
                    confidence: this.calculateEmailConfidence(emailLower, industry, targetRole)
                };
                
                if (this.isPrimaryDecisionMakerEmail(emailLower, industry, targetRole)) {
                    contacts.primary.push(contact);
                } else if (this.isSecondaryDecisionMakerEmail(emailLower, industry, targetRole)) {
                    contacts.secondary.push(contact);
                } else if (this.isGatekeeperEmail(emailLower)) {
                    contacts.gatekeeper.push(contact);
                }
            });
            
            // Categorize phone numbers
            phones.forEach(phone => {
                const contact = {
                    type: 'phone',
                    value: this.cleanPhoneNumber(phone),
                    source: 'website',
                    confidence: this.calculatePhoneConfidence(phone, industry, targetRole)
                };
                
                // Most business phone numbers are gatekeeper level
                contacts.gatekeeper.push(contact);
            });
            
            // Look for specific decision maker mentions in text
            const decisionMakerMentions = this.findDecisionMakerMentions(html, industry, targetRole);
            contacts.primary.push(...decisionMakerMentions);
            
        } catch (error) {
            console.error(`[WEBSITE CONTACT EXTRACTION ERROR]`, error.message);
        }
        
        return contacts;
    }
    
    // Extract contacts from Companies House officers
    async extractContactsFromOfficers(companyNumber, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            const response = await axios.get(`https://api.company-information.service.gov.uk/company/${companyNumber}/officers`, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`
                },
                timeout: 5000
            });
            
            if (response.data.items) {
                response.data.items.forEach(officer => {
                    if (this.isDecisionMakerOfficer(officer, industry, targetRole)) {
                        const contact = {
                            type: 'officer',
                            value: officer.name,
                            title: officer.officer_role,
                            source: 'companies_house',
                            confidence: this.calculateOfficerConfidence(officer, industry, targetRole)
                        };
                        
                        if (this.isPrimaryOfficer(officer, industry, targetRole)) {
                            contacts.primary.push(contact);
                        } else {
                            contacts.secondary.push(contact);
                        }
                    }
                });
            }
        } catch (error) {
            console.error(`[COMPANIES HOUSE OFFICER ERROR]`, error.message);
        }
        
        return contacts;
    }
    
    // Search LinkedIn for decision maker contacts
    async searchLinkedInContacts(businessName, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            // This would require LinkedIn API or web scraping
            // For now, we'll simulate the search
            const searchQuery = `${targetRole} ${businessName} ${industry}`;
            
            // In a real implementation, you'd use LinkedIn Sales Navigator API
            // or web scraping to find decision makers
            
            console.log(`[LINKEDIN SEARCH] Would search for: "${searchQuery}"`);
            
            // Simulated result
            const simulatedContact = {
                type: 'linkedin',
                value: `linkedin.com/in/${targetRole.toLowerCase().replace(/\s+/g, '-')}-${businessName.toLowerCase().replace(/\s+/g, '-')}`,
                source: 'linkedin',
                confidence: 70
            };
            
            contacts.primary.push(simulatedContact);
            
        } catch (error) {
            console.error(`[LINKEDIN SEARCH ERROR]`, error.message);
        }
        
        return contacts;
    }
    
    // Search Google for decision maker information
    async searchGoogleForDecisionMaker(businessName, industry, targetRole) {
        const contacts = { primary: [], secondary: [], gatekeeper: [] };
        
        try {
            const searchQuery = `"${targetRole}" "${businessName}" ${industry} contact email phone`;
            
            // In a real implementation, you'd use Google Custom Search API
            // or web scraping to find decision maker information
            
            console.log(`[GOOGLE SEARCH] Would search for: "${searchQuery}"`);
            
            // Simulated result
            const simulatedContact = {
                type: 'google_search',
                value: `Found via Google search: ${searchQuery}`,
                source: 'google_search',
                confidence: 60
            };
            
            contacts.secondary.push(simulatedContact);
            
        } catch (error) {
            console.error(`[GOOGLE SEARCH ERROR]`, error.message);
        }
        
        return contacts;
    }
    
    // Check if email belongs to primary decision maker
    isPrimaryDecisionMakerEmail(email, industry, targetRole) {
        const primaryPatterns = this.decisionMakerPatterns.email.primary;
        return primaryPatterns.some(pattern => email.includes(pattern));
    }
    
    // Check if email belongs to secondary decision maker
    isSecondaryDecisionMakerEmail(email, industry, targetRole) {
        const secondaryPatterns = this.decisionMakerPatterns.email.secondary;
        return secondaryPatterns.some(pattern => email.includes(pattern));
    }
    
    // Check if email belongs to gatekeeper
    isGatekeeperEmail(email) {
        const gatekeeperPatterns = this.decisionMakerPatterns.email.gatekeeper;
        return gatekeeperPatterns.some(pattern => email.includes(pattern));
    }
    
    // Calculate confidence score for email
    calculateEmailConfidence(email, industry, targetRole) {
        let confidence = 50; // Base confidence
        
        if (this.isPrimaryDecisionMakerEmail(email, industry, targetRole)) {
            confidence += 30;
        } else if (this.isSecondaryDecisionMakerEmail(email, industry, targetRole)) {
            confidence += 20;
        } else if (this.isGatekeeperEmail(email)) {
            confidence += 10;
        }
        
        // Bonus for industry-specific patterns
        if (industry === 'dental' && email.includes('dental')) confidence += 10;
        if (industry === 'legal' && email.includes('legal')) confidence += 10;
        if (industry === 'beauty' && email.includes('beauty')) confidence += 10;
        
        return Math.min(100, confidence);
    }
    
    // Calculate confidence score for phone
    calculatePhoneConfidence(phone, industry, targetRole) {
        let confidence = 60; // Base confidence for phone numbers
        
        // Most business phone numbers are gatekeeper level
        if (phone.includes('020') || phone.includes('011') || phone.includes('0121')) {
            confidence += 10; // London, Leeds, Birmingham area codes
        }
        
        return Math.min(100, confidence);
    }
    
    // Check if officer is a decision maker
    isDecisionMakerOfficer(officer, industry, targetRole) {
        const role = officer.officer_role.toLowerCase();
        const name = officer.name.toLowerCase();
        
        // Check for decision maker roles
        const decisionMakerRoles = [
            'director', 'manager', 'owner', 'principal', 'partner',
            'ceo', 'founder', 'head', 'lead', 'senior'
        ];
        
        return decisionMakerRoles.some(dmRole => role.includes(dmRole));
    }
    
    // Check if officer is primary decision maker
    isPrimaryOfficer(officer, industry, targetRole) {
        const role = officer.officer_role.toLowerCase();
        
        const primaryRoles = [
            'director', 'manager', 'owner', 'principal', 'partner',
            'ceo', 'founder', 'head'
        ];
        
        return primaryRoles.some(primaryRole => role.includes(primaryRole));
    }
    
    // Calculate confidence score for officer
    calculateOfficerConfidence(officer, industry, targetRole) {
        let confidence = 70; // Base confidence for officers
        
        if (this.isPrimaryOfficer(officer, industry, targetRole)) {
            confidence += 20;
        }
        
        return Math.min(100, confidence);
    }
    
    // Find decision maker mentions in website text
    findDecisionMakerMentions(html, industry, targetRole) {
        const contacts = [];
        
        // Look for specific decision maker mentions
        const decisionMakerRegex = new RegExp(`(${targetRole}[^<]*?)(?:email|contact|reach|get in touch)[^<]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})`, 'gi');
        const matches = html.match(decisionMakerRegex);
        
        if (matches) {
            matches.forEach(match => {
                const emailMatch = match.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                if (emailMatch) {
                    contacts.push({
                        type: 'email',
                        value: emailMatch[1],
                        source: 'website_mention',
                        confidence: 80
                    });
                }
            });
        }
        
        return contacts;
    }
    
    // Clean phone number
    cleanPhoneNumber(phone) {
        return phone.replace(/[^\d\+]/g, '').trim();
    }
    
    // Merge contacts from different sources
    mergeContacts(targetContacts, sourceContacts) {
        ['primary', 'secondary', 'gatekeeper'].forEach(category => {
            if (sourceContacts[category]) {
                targetContacts[category].push(...sourceContacts[category]);
            }
        });
    }
    
    // Generate outreach strategy based on found contacts
    generateOutreachStrategy(contacts, business, industry, targetRole) {
        const strategy = {
            approach: 'multi-channel',
            channels: [],
            priority: 'primary',
            fallback: 'gatekeeper'
        };
        
        if (contacts.primary.length > 0) {
            strategy.channels.push('direct_email');
            strategy.channels.push('linkedin');
            strategy.priority = 'primary';
        } else if (contacts.secondary.length > 0) {
            strategy.channels.push('professional_email');
            strategy.channels.push('linkedin');
            strategy.priority = 'secondary';
        } else if (contacts.gatekeeper.length > 0) {
            strategy.channels.push('phone');
            strategy.channels.push('friendly_email');
            strategy.priority = 'gatekeeper';
        } else {
            strategy.channels.push('cold_outreach');
            strategy.priority = 'cold';
        }
        
        return strategy;
    }
}

export default DecisionMakerContactFinder;
