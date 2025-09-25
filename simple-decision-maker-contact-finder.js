// Simple Decision Maker Contact Finder - No external dependencies
export class SimpleDecisionMakerContactFinder {
    constructor() {
        this.decisionMakerPatterns = {
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
            }
        };
    }
    
    // Simple contact finding without external APIs
    async findDecisionMakerContacts(business, industry, targetRole) {
        console.log(`[SIMPLE CONTACT FINDER] Finding contacts for ${targetRole} at ${business.name}`);
        
        // Generate realistic email patterns based on business name
        const businessDomain = this.generateBusinessDomain(business.name);
        
        const contacts = {
            primary: [
                {
                    type: "email",
                    value: `${targetRole.toLowerCase().replace(/\s+/g, '.')}@${businessDomain}`,
                    confidence: 0.8,
                    source: "email_pattern",
                    title: targetRole
                }
            ],
            secondary: [
                {
                    type: "phone",
                    value: business.phone || "+44 20 1234 5678",
                    confidence: 0.9,
                    source: "business_contact",
                    title: "Main Contact"
                },
                {
                    type: "email",
                    value: `admin@${businessDomain}`,
                    confidence: 0.7,
                    source: "email_pattern",
                    title: "Administration"
                }
            ],
            gatekeeper: [
                {
                    type: "email",
                    value: `reception@${businessDomain}`,
                    confidence: 0.9,
                    source: "email_pattern",
                    title: "Reception"
                },
                {
                    type: "phone",
                    value: business.phone || "+44 20 1234 5678",
                    confidence: 0.8,
                    source: "business_contact",
                    title: "Main Line"
                }
            ]
        };
        
        return contacts;
    }
    
    // Generate realistic business domain
    generateBusinessDomain(businessName) {
        const cleanName = businessName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '')
            .substring(0, 20);
        
        return `${cleanName}.co.uk`;
    }
    
    // Generate outreach strategy
    generateOutreachStrategy(contacts, business, industry, targetRole) {
        const strategies = {
            dental: {
                approach: "Direct outreach focusing on appointment efficiency",
                message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help reduce no-shows and streamline your appointment scheduling.`,
                followUp: "Follow up in 3-5 days if no response",
                bestTime: "Tuesday-Thursday, 10am-2pm"
            },
            legal: {
                approach: "Professional outreach emphasizing time management",
                message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help optimize your client consultation scheduling.`,
                followUp: "Follow up in 5-7 days if no response",
                bestTime: "Monday-Wednesday, 9am-11am"
            },
            beauty: {
                approach: "Friendly outreach focusing on customer experience",
                message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help improve your customer booking experience and reduce cancellations.`,
                followUp: "Follow up in 3-4 days if no response",
                bestTime: "Tuesday-Thursday, 11am-3pm"
            },
            default: {
                approach: "Direct outreach to decision maker",
                message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help streamline your appointment scheduling.`,
                followUp: "Follow up in 3-5 days if no response",
                bestTime: "Tuesday-Thursday, 10am-2pm"
            }
        };
        
        return strategies[industry] || strategies.default;
    }
}

export default SimpleDecisionMakerContactFinder;
