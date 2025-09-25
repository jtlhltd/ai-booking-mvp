// Decision Maker Identification & Outreach System
export class DecisionMakerIdentifier {
    constructor() {
        this.decisionMakerRoles = {
            dental: {
                primary: ['Practice Owner', 'Principal Dentist', 'Practice Manager'],
                secondary: ['Office Manager', 'Reception Supervisor'],
                gatekeepers: ['Receptionist', 'Administrative Assistant']
            },
            legal: {
                primary: ['Managing Partner', 'Senior Partner', 'Practice Manager'],
                secondary: ['IT Director', 'Operations Manager'],
                gatekeepers: ['Legal Secretary', 'Paralegal']
            },
            beauty: {
                primary: ['Salon Owner', 'Manager', 'Senior Stylist'],
                secondary: ['Reception Manager', 'Assistant Manager'],
                gatekeepers: ['Receptionist', 'Stylist']
            },
            medical: {
                primary: ['Practice Manager', 'Senior Partner', 'IT Director'],
                secondary: ['Office Manager', 'Operations Manager'],
                gatekeepers: ['Receptionist', 'Medical Secretary']
            },
            fitness: {
                primary: ['Gym Owner', 'Manager', 'Operations Director'],
                secondary: ['Assistant Manager', 'Membership Manager'],
                gatekeepers: ['Receptionist', 'Personal Trainer']
            }
        };

        this.decisionMakerSignals = {
            // LinkedIn signals
            linkedin: {
                titles: [
                    'owner', 'manager', 'director', 'principal', 'partner',
                    'ceo', 'founder', 'head of', 'lead', 'senior'
                ],
                keywords: [
                    'practice', 'clinic', 'firm', 'salon', 'studio',
                    'management', 'operations', 'administration'
                ]
            },
            // Website signals
            website: {
                aboutPage: ['about us', 'our team', 'leadership', 'management'],
                contactPage: ['contact us', 'get in touch', 'book appointment'],
                staffPage: ['our staff', 'meet the team', 'team members']
            },
            // Business signals
            business: {
                size: {
                    small: '1-10 employees',
                    medium: '11-50 employees',
                    large: '51+ employees'
                },
                revenue: {
                    small: '<£500k',
                    medium: '£500k-£2m',
                    large: '>£2m'
                }
            }
        };
    }

    // Identify decision makers from business data
    identifyDecisionMakers(business, industry) {
        const industryRoles = this.decisionMakerRoles[industry] || this.decisionMakerRoles.dental;
        const decisionMakers = [];

        // Primary decision makers (highest priority)
        industryRoles.primary.forEach(role => {
            decisionMakers.push({
                role: role,
                priority: 'primary',
                contactMethod: 'direct',
                approach: 'business-focused',
                painPoints: this.getPainPoints(industry, role)
            });
        });

        // Secondary decision makers
        industryRoles.secondary.forEach(role => {
            decisionMakers.push({
                role: role,
                priority: 'secondary',
                contactMethod: 'professional',
                approach: 'efficiency-focused',
                painPoints: this.getPainPoints(industry, role)
            });
        });

        // Gatekeepers (for warm introductions)
        industryRoles.gatekeepers.forEach(role => {
            decisionMakers.push({
                role: role,
                priority: 'gatekeeper',
                contactMethod: 'friendly',
                approach: 'relationship-building',
                painPoints: this.getPainPoints(industry, role)
            });
        });

        return decisionMakers;
    }

    // Get pain points for specific roles
    getPainPoints(industry, role) {
        const painPoints = {
            dental: {
                'Practice Owner': [
                    'Missing 40-60% of booking opportunities',
                    'Staff spending time on phone instead of patients',
                    'Manual scheduling errors and double bookings',
                    'No-shows costing £200+ per missed appointment'
                ],
                'Practice Manager': [
                    'Managing appointment schedules manually',
                    'Staff training on booking systems',
                    'Patient complaints about booking process',
                    'Reporting on appointment metrics'
                ],
                'Office Manager': [
                    'Answering phones during busy periods',
                    'Managing appointment cancellations',
                    'Following up on missed appointments',
                    'Coordinating with dental staff schedules'
                ]
            },
            legal: {
                'Managing Partner': [
                    'Client intake inefficiency',
                    'Missed consultation opportunities',
                    'Staff time on administrative tasks',
                    'Competition for new clients'
                ],
                'Practice Manager': [
                    'Managing consultation schedules',
                    'Client follow-up processes',
                    'Staff productivity metrics',
                    'Client satisfaction tracking'
                ],
                'IT Director': [
                    'System integration challenges',
                    'Data security compliance',
                    'Staff training on new systems',
                    'Technical support requirements'
                ]
            },
            beauty: {
                'Salon Owner': [
                    'Double bookings causing customer complaints',
                    'Last-minute cancellations',
                    'Staff scheduling conflicts',
                    'Revenue lost to no-shows'
                ],
                'Manager': [
                    'Managing stylist schedules',
                    'Customer booking preferences',
                    'Inventory management',
                    'Customer retention'
                ],
                'Receptionist': [
                    'Answering phones during busy periods',
                    'Managing appointment changes',
                    'Customer service complaints',
                    'Scheduling conflicts'
                ]
            }
        };

        return painPoints[industry]?.[role] || [
            'Manual booking process',
            'Missed appointment opportunities',
            'Staff time on administrative tasks',
            'Customer service challenges'
        ];
    }

    // Generate personalized outreach messages
    generateOutreachMessage(business, decisionMaker, industry) {
        const templates = {
            primary: {
                dental: `Hi [Name],

I noticed [Business Name] has been growing - that's fantastic!

But I'm curious: how many potential patients are you losing because they can't book appointments outside business hours?

Most dental practices miss 40-60% of booking opportunities because:
- Patients call when you're closed
- Staff are busy with patients during calls
- Manual scheduling creates errors

Our AI booking system has helped practices like yours:
✅ Increase bookings by 300%
✅ Reduce no-shows by 50%
✅ Free up staff time for patient care

Would you be open to a 15-minute call to see how this could work for [Business Name]?

Best regards,
[Your Name]`,

                legal: `Hi [Name],

I saw [Business Name] handles [practice area] cases - impressive work!

Quick question: How much time does your team spend on initial client consultations and intake?

Most law firms we work with spend 2-3 hours per day just on:
- Scheduling consultations
- Qualifying leads
- Following up with prospects

Our AI system automates this entire process:
✅ Books consultations 24/7
✅ Qualifies leads automatically
✅ Follows up with prospects
✅ Integrates with your calendar

[Business Name] could save 10+ hours per week while booking more consultations.

Worth a 15-minute conversation?

Best,
[Your Name]`,

                beauty: `Hi [Name],

I love what [Business Name] is doing with [specific service/trend]!

But I'm curious: how often do you deal with double bookings or last-minute cancellations?

Most salons lose 20-30% of revenue due to:
- Double bookings from manual scheduling
- No-shows with no follow-up
- Staff spending time on phone instead of clients

Our AI booking system eliminates these issues:
✅ Prevents double bookings
✅ Reduces no-shows by 60%
✅ Books appointments 24/7
✅ Sends automatic reminders

[Business Name] could increase revenue by 25% while improving customer experience.

Interested in a quick demo?

Best regards,
[Your Name]`
            },

            secondary: {
                dental: `Hi [Name],

I hope this email finds you well. I'm reaching out because I noticed [Business Name] is a growing dental practice, and I believe I can help streamline your appointment booking process.

As a [Role], you probably deal with the daily challenges of:
- Managing appointment schedules
- Training staff on booking systems
- Handling patient complaints about booking
- Reporting on appointment metrics

Our AI booking system has helped practice managers like you:
✅ Reduce administrative workload by 70%
✅ Improve patient satisfaction scores
✅ Generate detailed booking reports
✅ Integrate seamlessly with existing systems

Would you be interested in a brief 15-minute call to see how this could benefit [Business Name]?

Best regards,
[Your Name]`,

                legal: `Hi [Name],

I'm reaching out because I believe [Business Name] could benefit from our AI-powered client intake system.

As a [Role], you're likely dealing with:
- Managing consultation schedules
- Client follow-up processes
- Staff productivity metrics
- Client satisfaction tracking

Our system automates these processes and has helped legal professionals:
✅ Save 10+ hours per week on admin tasks
✅ Increase qualified consultations by 250%
✅ Improve client satisfaction scores
✅ Generate detailed intake reports

Would you be open to a 15-minute call to discuss how this could work for [Business Name]?

Best regards,
[Your Name]`,

                beauty: `Hi [Name],

I hope you're having a great day! I'm reaching out because I believe [Business Name] could benefit from our AI booking system.

As a [Role], you probably deal with:
- Managing stylist schedules
- Customer booking preferences
- Inventory management
- Customer retention

Our system has helped salon managers like you:
✅ Reduce scheduling conflicts by 80%
✅ Increase customer retention by 40%
✅ Improve staff productivity
✅ Generate customer insights

Would you be interested in a quick 15-minute call to see how this could work for [Business Name]?

Best regards,
[Your Name]`
            },

            gatekeeper: {
                dental: `Hi [Name],

I hope you're having a great day! I'm reaching out because I believe I can help make your job easier at [Business Name].

As a [Role], you probably deal with:
- Answering phones during busy periods
- Managing appointment changes
- Customer service complaints
- Scheduling conflicts

Our AI booking system can help by:
✅ Automating appointment booking 24/7
✅ Reducing phone calls during busy periods
✅ Preventing scheduling conflicts
✅ Improving customer satisfaction

I'd love to show you how this could make your day easier. Would you be open to a brief 15-minute call?

Best regards,
[Your Name]`,

                legal: `Hi [Name],

I hope this email finds you well! I'm reaching out because I believe I can help streamline the client intake process at [Business Name].

As a [Role], you probably deal with:
- Managing consultation schedules
- Client follow-up processes
- Administrative tasks
- Client communication

Our AI system can help by:
✅ Automating consultation booking
✅ Managing client follow-ups
✅ Reducing administrative workload
✅ Improving client satisfaction

Would you be interested in a quick 15-minute call to see how this could benefit you and [Business Name]?

Best regards,
[Your Name]`,

                beauty: `Hi [Name],

I hope you're having a great day! I'm reaching out because I believe I can help make your job easier at [Business Name].

As a [Role], you probably deal with:
- Answering phones during busy periods
- Managing appointment changes
- Customer service complaints
- Scheduling conflicts

Our AI booking system can help by:
✅ Automating appointment booking 24/7
✅ Reducing phone calls during busy periods
✅ Preventing scheduling conflicts
✅ Improving customer satisfaction

I'd love to show you how this could make your day easier. Would you be open to a brief 15-minute call?

Best regards,
[Your Name]`
            }
        };

        const template = templates[decisionMaker.priority]?.[industry] || templates.primary.dental;
        
        return template
            .replace(/\[Name\]/g, decisionMaker.role)
            .replace(/\[Business Name\]/g, business.name)
            .replace(/\[Role\]/g, decisionMaker.role)
            .replace(/\[practice area\]/g, this.getPracticeArea(business))
            .replace(/\[specific service\/trend\]/g, this.getServiceTrend(business, industry))
            .replace(/\[Your Name\]/g, 'Your Name');
    }

    // Get practice area for legal firms
    getPracticeArea(business) {
        const name = business.name.toLowerCase();
        if (name.includes('family')) return 'family law';
        if (name.includes('criminal')) return 'criminal law';
        if (name.includes('personal injury')) return 'personal injury';
        if (name.includes('corporate')) return 'corporate law';
        if (name.includes('immigration')) return 'immigration law';
        return 'legal services';
    }

    // Get service trend for beauty salons
    getServiceTrend(business, industry) {
        if (industry === 'beauty') {
            const name = business.name.toLowerCase();
            if (name.includes('hair')) return 'hair styling';
            if (name.includes('nail')) return 'nail art';
            if (name.includes('spa')) return 'spa treatments';
            if (name.includes('beauty')) return 'beauty treatments';
            return 'beauty services';
        }
        return 'your services';
    }

    // Calculate decision maker score
    calculateDecisionMakerScore(business, decisionMaker, industry) {
        let score = 0;

        // Role priority
        if (decisionMaker.priority === 'primary') score += 40;
        else if (decisionMaker.priority === 'secondary') score += 25;
        else if (decisionMaker.priority === 'gatekeeper') score += 10;

        // Business size
        if (business.estimatedEmployees === '11-50') score += 15;
        else if (business.estimatedEmployees === '51-250') score += 20;
        else if (business.estimatedEmployees === '250+') score += 25;

        // Contact information
        if (business.phone) score += 10;
        if (business.email) score += 10;
        if (business.website) score += 5;

        // Business status
        if (business.companyStatus === 'active') score += 10;

        // Industry relevance
        const relevantIndustries = ['dental', 'legal', 'beauty', 'medical', 'fitness'];
        if (relevantIndustries.includes(industry)) score += 15;

        return Math.min(100, score);
    }

    // Generate outreach sequence
    generateOutreachSequence(business, decisionMaker, industry) {
        const sequence = [
            {
                day: 0,
                type: 'initial_email',
                subject: this.getEmailSubject(business, decisionMaker, industry),
                message: this.generateOutreachMessage(business, decisionMaker, industry)
            },
            {
                day: 3,
                type: 'follow_up',
                subject: `Re: ${this.getEmailSubject(business, decisionMaker, industry)}`,
                message: this.getFollowUpMessage(business, decisionMaker, industry)
            },
            {
                day: 7,
                type: 'value_add',
                subject: `Case Study: How [Similar Business] Increased Bookings by 300%`,
                message: this.getValueAddMessage(business, decisionMaker, industry)
            },
            {
                day: 14,
                type: 'final_offer',
                subject: `Final Offer: Free 30-Day Trial for [Business Name]`,
                message: this.getFinalOfferMessage(business, decisionMaker, industry)
            }
        ];

        return sequence;
    }

    // Get email subject lines
    getEmailSubject(business, decisionMaker, industry) {
        const subjects = {
            dental: {
                primary: `300% More Appointments for ${business.name}?`,
                secondary: `Streamline Booking at ${business.name}`,
                gatekeeper: `Make Your Job Easier at ${business.name}`
            },
            legal: {
                primary: `Automate Client Intake for ${business.name}?`,
                secondary: `Streamline Consultations at ${business.name}`,
                gatekeeper: `Simplify Client Intake at ${business.name}`
            },
            beauty: {
                primary: `Stop Double Bookings at ${business.name}?`,
                secondary: `Streamline Booking at ${business.name}`,
                gatekeeper: `Make Your Job Easier at ${business.name}`
            }
        };

        return subjects[industry]?.[decisionMaker.priority] || `Help ${business.name} Grow`;
    }

    // Get follow-up messages
    getFollowUpMessage(business, decisionMaker, industry) {
        return `Hi [Name],

I wanted to follow up on my previous email about helping ${business.name} streamline their booking process.

I understand you're busy, but I believe this could genuinely help your business grow.

Would you be open to a quick 15-minute call this week to discuss how our AI booking system could benefit ${business.name}?

Best regards,
[Your Name]`;
    }

    // Get value-add messages
    getValueAddMessage(business, decisionMaker, industry) {
        return `Hi [Name],

I wanted to share a quick case study that might be relevant to ${business.name}.

We recently helped a similar [industry] business increase their bookings by 300% and reduce no-shows by 50% using our AI booking system.

The key benefits they saw:
✅ 24/7 appointment booking
✅ Automated follow-ups
✅ Reduced administrative workload
✅ Improved customer satisfaction

Would you be interested in a brief call to see how this could work for ${business.name}?

Best regards,
[Your Name]`;
    }

    // Get final offer messages
    getFinalOfferMessage(business, decisionMaker, industry) {
        return `Hi [Name],

This is my final follow-up about helping ${business.name} streamline their booking process.

I'm offering a free 30-day trial with no setup fees for the first 10 businesses this month.

This includes:
✅ Full system setup
✅ Staff training
✅ 30-day free trial
✅ No long-term commitment

Would you be interested in taking advantage of this offer?

Best regards,
[Your Name]`;
    }
}

export default DecisionMakerIdentifier;
