// Industry-specific templates and configurations
export const industryTemplates = {
    dental: {
        name: "Dental Practice",
        icon: "🦷",
        aiPersonality: "Sarah",
        businessType: "dental practice",
        services: ["cleaning", "checkup", "filling", "whitening", "emergency"],
        pricing: {
            cleaning: "£80",
            checkup: "£60", 
            filling: "£120",
            whitening: "£200"
        },
        availability: {
            monday: ["9 AM", "10 AM", "2 PM", "3 PM"],
            tuesday: ["9 AM", "1 PM", "4 PM"],
            wednesday: ["10 AM", "2 PM", "5 PM"],
            thursday: ["9 AM", "1 PM", "3 PM"],
            friday: ["10 AM", "2 PM", "4 PM"]
        },
        emergencyMessage: "For dental emergencies, please call us directly at (555) 123-4567",
        greeting: "Hello! I'm Sarah from [Practice Name]. How can I help you today?",
        commonQuestions: [
            "I need a cleaning",
            "What are your prices?", 
            "Do you have availability tomorrow?",
            "I have a dental emergency"
        ]
    },
    
    legal: {
        name: "Law Firm",
        icon: "⚖️",
        aiPersonality: "Michael",
        businessType: "law firm",
        services: ["consultation", "case review", "document preparation", "court representation"],
        pricing: {
            consultation: "£150/hour",
            caseReview: "£200/hour",
            documentPrep: "£100/hour"
        },
        availability: {
            monday: ["9 AM", "11 AM", "2 PM", "4 PM"],
            tuesday: ["10 AM", "1 PM", "3 PM"],
            wednesday: ["9 AM", "2 PM", "4 PM"],
            thursday: ["10 AM", "1 PM", "3 PM"],
            friday: ["9 AM", "11 AM", "2 PM"]
        },
        emergencyMessage: "For urgent legal matters, please call us directly at (555) 123-4567",
        greeting: "Hello! I'm Michael from [Firm Name]. How can I assist you today?",
        commonQuestions: [
            "I need a consultation",
            "What are your rates?",
            "Do you handle [case type]?",
            "I have a legal emergency"
        ]
    },
    
    beauty: {
        name: "Beauty Salon",
        icon: "💄",
        aiPersonality: "Emma",
        businessType: "beauty salon",
        services: ["haircut", "coloring", "facial", "manicure", "massage"],
        pricing: {
            haircut: "£45",
            coloring: "£80",
            facial: "£60",
            manicure: "£25",
            massage: "£70"
        },
        availability: {
            monday: ["9 AM", "11 AM", "2 PM", "4 PM"],
            tuesday: ["10 AM", "1 PM", "3 PM", "5 PM"],
            wednesday: ["9 AM", "11 AM", "2 PM", "4 PM"],
            thursday: ["10 AM", "1 PM", "3 PM", "5 PM"],
            friday: ["9 AM", "11 AM", "2 PM", "4 PM"],
            saturday: ["10 AM", "12 PM", "2 PM", "4 PM"]
        },
        emergencyMessage: "For urgent beauty services, please call us directly at (555) 123-4567",
        greeting: "Hello! I'm Emma from [Salon Name]. How can I help you look beautiful today?",
        commonQuestions: [
            "I need a haircut",
            "What are your prices?",
            "Do you have weekend availability?",
            "I want to book a package"
        ]
    },
    
    medical: {
        name: "Medical Practice",
        icon: "🏥",
        aiPersonality: "Dr. Johnson",
        businessType: "medical practice",
        services: ["consultation", "checkup", "blood work", "vaccination"],
        pricing: {
            consultation: "£100",
            checkup: "£80",
            bloodWork: "£50",
            vaccination: "£30"
        },
        availability: {
            monday: ["8 AM", "10 AM", "2 PM", "4 PM"],
            tuesday: ["9 AM", "11 AM", "3 PM"],
            wednesday: ["8 AM", "10 AM", "2 PM", "4 PM"],
            thursday: ["9 AM", "11 AM", "3 PM"],
            friday: ["8 AM", "10 AM", "2 PM"]
        },
        emergencyMessage: "For medical emergencies, please call 999 or visit A&E immediately",
        greeting: "Hello! I'm Dr. Johnson from [Practice Name]. How can I help you today?",
        commonQuestions: [
            "I need an appointment",
            "What are your fees?",
            "Do you have same-day availability?",
            "I have a medical emergency"
        ]
    },
    
    fitness: {
        name: "Fitness Studio",
        icon: "💪",
        aiPersonality: "Alex",
        businessType: "fitness studio",
        services: ["personal training", "group classes", "nutrition consultation", "membership"],
        pricing: {
            personalTraining: "£60/session",
            groupClass: "£15/class",
            nutritionConsult: "£80",
            membership: "£50/month"
        },
        availability: {
            monday: ["6 AM", "8 AM", "12 PM", "6 PM", "8 PM"],
            tuesday: ["7 AM", "9 AM", "1 PM", "7 PM"],
            wednesday: ["6 AM", "8 AM", "12 PM", "6 PM", "8 PM"],
            thursday: ["7 AM", "9 AM", "1 PM", "7 PM"],
            friday: ["6 AM", "8 AM", "12 PM", "6 PM"],
            saturday: ["8 AM", "10 AM", "2 PM"],
            sunday: ["9 AM", "11 AM"]
        },
        emergencyMessage: "For fitness emergencies, please call us directly at (555) 123-4567",
        greeting: "Hello! I'm Alex from [Studio Name]. Ready to get fit today?",
        commonQuestions: [
            "I want to start training",
            "What classes do you offer?",
            "Do you have beginner sessions?",
            "I need a nutrition plan"
        ]
    }
};

// Function to get industry template
export function getIndustryTemplate(industry) {
    return industryTemplates[industry] || industryTemplates.dental;
}

// Function to get all available industries
export function getAvailableIndustries() {
    return Object.keys(industryTemplates).map(key => ({
        key,
        ...industryTemplates[key]
    }));
}

// Function to generate industry-specific demo responses
export function generateIndustryResponse(industry, message, conversationState) {
    const template = getIndustryTemplate(industry);
    const lowerMessage = message.toLowerCase();
    
    // Industry-specific response logic
    if (lowerMessage.includes('emergency') || lowerMessage.includes('urgent')) {
        return template.emergencyMessage;
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
        const services = Object.entries(template.pricing)
            .map(([service, price]) => `${service}: ${price}`)
            .join(', ');
        return `Our services include: ${services}. Would you like to book an appointment?`;
    }
    
    if (lowerMessage.includes('available') || lowerMessage.includes('tomorrow')) {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const slots = template.availability[today] || template.availability.monday;
        return `We have slots at ${slots.join(', ')} ${today}. Which time works best for you?`;
    }
    
    return template.greeting;
}
