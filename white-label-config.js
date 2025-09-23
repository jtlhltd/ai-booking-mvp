// White-label configuration system
export const whiteLabelConfig = {
    // Default configuration
    default: {
        brandName: "AI Booking MVP",
        logo: "/logo-default.png",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        accentColor: "#10b981",
        fontFamily: "Inter, sans-serif",
        customDomain: null,
        features: {
            sms: true,
            voice: true,
            calendar: true,
            analytics: true,
            whiteLabel: false
        },
        limits: {
            smsPerMonth: 1000,
            callsPerMonth: 100,
            users: 5
        }
    },
    
    // Partner configurations
    partners: {
        dentalSoftware: {
            brandName: "SmartDental Booking",
            logo: "/partners/dental-software.png",
            primaryColor: "#059669",
            secondaryColor: "#047857",
            accentColor: "#10b981",
            fontFamily: "Roboto, sans-serif",
            customDomain: "booking.smartdental.com",
            features: {
                sms: true,
                voice: true,
                calendar: true,
                analytics: true,
                whiteLabel: true,
                integration: "dentrix"
            },
            limits: {
                smsPerMonth: 5000,
                callsPerMonth: 500,
                users: 25
            }
        },
        
        legalSoftware: {
            brandName: "LegalBook Pro",
            logo: "/partners/legal-software.png",
            primaryColor: "#1e40af",
            secondaryColor: "#1e3a8a",
            accentColor: "#3b82f6",
            fontFamily: "Source Sans Pro, sans-serif",
            customDomain: "booking.legalbook.com",
            features: {
                sms: true,
                voice: true,
                calendar: true,
                analytics: true,
                whiteLabel: true,
                integration: "clio"
            },
            limits: {
                smsPerMonth: 3000,
                callsPerMonth: 300,
                users: 15
            }
        },
        
        beautySoftware: {
            brandName: "BeautyBook AI",
            logo: "/partners/beauty-software.png",
            primaryColor: "#be185d",
            secondaryColor: "#9d174d",
            accentColor: "#ec4899",
            fontFamily: "Poppins, sans-serif",
            customDomain: "booking.beautybook.com",
            features: {
                sms: true,
                voice: true,
                calendar: true,
                analytics: true,
                whiteLabel: true,
                integration: "vagaro"
            },
            limits: {
                smsPerMonth: 2000,
                callsPerMonth: 200,
                users: 10
            }
        }
    }
};

// Function to get partner configuration
export function getPartnerConfig(partnerKey) {
    return whiteLabelConfig.partners[partnerKey] || whiteLabelConfig.default;
}

// Function to apply white-label styling
export function applyWhiteLabelStyling(partnerKey) {
    const config = getPartnerConfig(partnerKey);
    
    // Apply CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--primary-color', config.primaryColor);
    root.style.setProperty('--secondary-color', config.secondaryColor);
    root.style.setProperty('--accent-color', config.accentColor);
    root.style.setProperty('--font-family', config.fontFamily);
    
    // Update logo
    const logo = document.querySelector('.logo');
    if (logo) {
        logo.textContent = config.brandName;
        if (config.logo) {
            logo.innerHTML = `<img src="${config.logo}" alt="${config.brandName}" style="height: 32px;">`;
        }
    }
    
    // Update page title
    document.title = `${config.brandName} - AI-Powered Booking`;
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
        metaDescription.content = `${config.brandName} - Transform your business with AI-powered booking automation.`;
    }
}

// Function to check feature access
export function hasFeatureAccess(partnerKey, feature) {
    const config = getPartnerConfig(partnerKey);
    return config.features[feature] || false;
}

// Function to check usage limits
export function checkUsageLimit(partnerKey, usageType, currentUsage) {
    const config = getPartnerConfig(partnerKey);
    const limit = config.limits[usageType];
    return currentUsage < limit;
}

// Function to get integration settings
export function getIntegrationSettings(partnerKey) {
    const config = getPartnerConfig(partnerKey);
    return {
        integration: config.features.integration,
        customDomain: config.customDomain,
        apiKey: `partner_${partnerKey}_${Date.now()}`
    };
}

// White-label landing page generator
export function generateWhiteLabelLandingPage(partnerKey, customContent = {}) {
    const config = getPartnerConfig(partnerKey);
    
    return {
        title: customContent.title || `${config.brandName} - AI-Powered Booking`,
        hero: {
            title: customContent.heroTitle || `Transform Your Business with ${config.brandName}`,
            subtitle: customContent.heroSubtitle || "Increase appointment bookings by 300% with intelligent AI automation",
            cta: customContent.heroCta || "Get Started Free"
        },
        features: customContent.features || [
            "24/7 AI Booking Assistant",
            "SMS & Voice Automation", 
            "Calendar Integration",
            "Analytics Dashboard",
            "Multi-Industry Support"
        ],
        pricing: customContent.pricing || {
            setup: "Free",
            sms: "£0.15 per message",
            calls: "£2.50 per call"
        },
        contact: {
            email: customContent.contactEmail || "hello@aibookingmvp.com",
            phone: customContent.contactPhone || "+1 (555) 123-4567"
        }
    };
}

// Partner onboarding checklist
export const partnerOnboardingChecklist = {
    setup: [
        "Configure white-label branding",
        "Set up custom domain",
        "Configure integration settings",
        "Set usage limits",
        "Create partner API keys"
    ],
    testing: [
        "Test booking flow",
        "Verify SMS delivery",
        "Test voice calls",
        "Check calendar integration",
        "Validate analytics"
    ],
    launch: [
        "Deploy to custom domain",
        "Send launch announcement",
        "Provide training materials",
        "Set up support channels",
        "Monitor usage metrics"
    ]
};

// Revenue sharing calculator
export function calculateRevenueShare(partnerKey, monthlyBookings, averageBookingValue) {
    const config = getPartnerConfig(partnerKey);
    const revenueShareRate = 0.20; // 20% revenue share
    
    const totalRevenue = monthlyBookings * averageBookingValue;
    const partnerShare = totalRevenue * revenueShareRate;
    
    return {
        totalRevenue,
        partnerShare,
        platformRevenue: totalRevenue - partnerShare,
        shareRate: revenueShareRate
    };
}
