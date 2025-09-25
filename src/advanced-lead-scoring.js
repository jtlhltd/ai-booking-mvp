// Advanced Lead Scoring System
class AdvancedLeadScoring {
  constructor() {
    this.scoringWeights = {
      // Business factors
      businessType: 0.25,
      businessSize: 0.15,
      location: 0.10,
      onlinePresence: 0.10,
      
      // Contact factors
      contactQuality: 0.20,
      decisionMakerAccess: 0.15,
      
      // Market factors
      industryTrends: 0.05
    };
  }

  calculateLeadScore(business, contacts, industry, marketData = {}) {
    const scores = {
      businessType: this.scoreBusinessType(business, industry),
      businessSize: this.scoreBusinessSize(business),
      location: this.scoreLocation(business),
      onlinePresence: this.scoreOnlinePresence(business),
      contactQuality: this.scoreContactQuality(contacts),
      decisionMakerAccess: this.scoreDecisionMakerAccess(contacts),
      industryTrends: this.scoreIndustryTrends(industry, marketData)
    };

    // Calculate weighted score
    let totalScore = 0;
    Object.keys(scores).forEach(factor => {
      totalScore += scores[factor] * this.scoringWeights[factor];
    });

    return {
      totalScore: Math.round(totalScore),
      breakdown: scores,
      grade: this.getScoreGrade(totalScore),
      recommendations: this.generateRecommendations(scores, business, industry)
    };
  }

  scoreBusinessType(business, industry) {
    const industryScores = {
      dental: 95,
      legal: 90,
      beauty: 85,
      healthcare: 90,
      veterinary: 80,
      fitness: 75,
      restaurant: 70,
      retail: 65,
      construction: 60,
      technology: 85
    };

    const baseScore = industryScores[industry] || 70;
    
    // Adjust based on business category
    if (business.category === 'dentist') return baseScore + 5;
    if (business.category === 'lawyer') return baseScore + 5;
    if (business.category === 'beauty_salon') return baseScore;
    
    return baseScore;
  }

  scoreBusinessSize(business) {
    if (!business.employees) return 50;
    
    const employeeRange = business.employees.split('-');
    const minEmployees = parseInt(employeeRange[0]);
    const maxEmployees = parseInt(employeeRange[1]);
    const avgEmployees = (minEmployees + maxEmployees) / 2;
    
    // Optimal size: 10-50 employees
    if (avgEmployees >= 10 && avgEmployees <= 50) return 100;
    if (avgEmployees >= 5 && avgEmployees <= 100) return 80;
    if (avgEmployees >= 2 && avgEmployees <= 200) return 60;
    return 40;
  }

  scoreLocation(business) {
    const address = business.address.toLowerCase();
    
    // Major UK cities score higher
    const majorCities = ['london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh'];
    const cityScore = majorCities.some(city => address.includes(city)) ? 20 : 0;
    
    // Business districts score higher
    const businessDistricts = ['city', 'centre', 'square', 'street'];
    const districtScore = businessDistricts.some(district => address.includes(district)) ? 15 : 0;
    
    // Postcode quality
    const postcodeScore = this.scorePostcode(business.address);
    
    return Math.min(100, cityScore + districtScore + postcodeScore);
  }

  scorePostcode(address) {
    // Extract postcode
    const postcodeMatch = address.match(/[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}/);
    if (!postcodeMatch) return 30;
    
    const postcode = postcodeMatch[0].replace(/\s/g, '');
    const area = postcode.substring(0, 2);
    
    // London postcodes
    if (['SW', 'SE', 'NW', 'NE', 'W', 'E', 'N', 'S', 'EC', 'WC'].includes(area)) {
      return 100;
    }
    
    // Major city postcodes
    if (['M', 'B', 'L', 'LS', 'G', 'EH'].includes(area)) {
      return 80;
    }
    
    // Other areas
    return 60;
  }

  scoreOnlinePresence(business) {
    let score = 0;
    
    // Website presence
    if (business.website) score += 30;
    
    // Email presence
    if (business.email) score += 20;
    
    // Phone presence
    if (business.phone) score += 20;
    
    // Rating presence
    if (business.rating > 0) score += 15;
    
    // Reviews presence
    if (business.reviews > 0) score += 15;
    
    return score;
  }

  scoreContactQuality(contacts) {
    if (!contacts || contacts.length === 0) return 0;
    
    let totalScore = 0;
    let contactCount = 0;
    
    contacts.forEach(contact => {
      let contactScore = 0;
      
      // Email quality
      if (contact.type === 'email') {
        contactScore += 40;
        if (contact.confidence > 0.8) contactScore += 20;
        if (contact.source === 'website_scraping') contactScore += 10;
        if (contact.source === 'linkedin') contactScore += 15;
      }
      
      // Phone quality
      if (contact.type === 'phone') {
        contactScore += 30;
        if (contact.confidence > 0.8) contactScore += 15;
      }
      
      // Source quality
      if (contact.source === 'companies_house') contactScore += 25;
      if (contact.source === 'email_verification') contactScore += 20;
      
      totalScore += contactScore;
      contactCount++;
    });
    
    return contactCount > 0 ? Math.min(100, totalScore / contactCount) : 0;
  }

  scoreDecisionMakerAccess(contacts) {
    if (!contacts || contacts.length === 0) return 0;
    
    const decisionMakerContacts = contacts.filter(contact => 
      contact.title && 
      (contact.title.toLowerCase().includes('manager') ||
       contact.title.toLowerCase().includes('director') ||
       contact.title.toLowerCase().includes('owner') ||
       contact.title.toLowerCase().includes('partner'))
    );
    
    if (decisionMakerContacts.length === 0) return 20;
    if (decisionMakerContacts.length === 1) return 60;
    if (decisionMakerContacts.length >= 2) return 100;
    
    return 40;
  }

  scoreIndustryTrends(industry, marketData) {
    const industryTrends = {
      dental: { growth: 0.05, demand: 0.8, competition: 0.6 },
      legal: { growth: 0.03, demand: 0.7, competition: 0.7 },
      beauty: { growth: 0.08, demand: 0.9, competition: 0.8 },
      healthcare: { growth: 0.06, demand: 0.9, competition: 0.5 },
      veterinary: { growth: 0.04, demand: 0.7, competition: 0.6 },
      fitness: { growth: 0.07, demand: 0.8, competition: 0.7 },
      restaurant: { growth: 0.02, demand: 0.6, competition: 0.9 },
      retail: { growth: 0.01, demand: 0.5, competition: 0.8 },
      construction: { growth: 0.03, demand: 0.6, competition: 0.7 },
      technology: { growth: 0.10, demand: 0.9, competition: 0.8 }
    };
    
    const trends = industryTrends[industry] || { growth: 0.03, demand: 0.6, competition: 0.7 };
    
    // Calculate score based on growth, demand, and competition
    const growthScore = trends.growth * 100;
    const demandScore = trends.demand * 100;
    const competitionScore = (1 - trends.competition) * 100;
    
    return (growthScore + demandScore + competitionScore) / 3;
  }

  getScoreGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C+';
    if (score >= 40) return 'C';
    return 'D';
  }

  generateRecommendations(scores, business, industry) {
    const recommendations = [];
    
    // Business type recommendations
    if (scores.businessType < 70) {
      recommendations.push({
        category: 'Business Type',
        message: `Consider focusing on ${industry} businesses with higher conversion potential`,
        priority: 'Medium'
      });
    }
    
    // Business size recommendations
    if (scores.businessSize < 60) {
      recommendations.push({
        category: 'Business Size',
        message: 'Target businesses with 10-50 employees for optimal results',
        priority: 'High'
      });
    }
    
    // Location recommendations
    if (scores.location < 70) {
      recommendations.push({
        category: 'Location',
        message: 'Focus on major UK cities and business districts',
        priority: 'Medium'
      });
    }
    
    // Contact quality recommendations
    if (scores.contactQuality < 60) {
      recommendations.push({
        category: 'Contact Quality',
        message: 'Improve contact research to find verified email addresses',
        priority: 'High'
      });
    }
    
    // Decision maker access recommendations
    if (scores.decisionMakerAccess < 50) {
      recommendations.push({
        category: 'Decision Maker Access',
        message: 'Research decision maker contacts more thoroughly',
        priority: 'High'
      });
    }
    
    return recommendations;
  }

  // Industry-specific scoring adjustments
  getIndustryMultipliers(industry) {
    const multipliers = {
      dental: { urgency: 1.2, budget: 1.1, techAdoption: 0.9 },
      legal: { urgency: 0.8, budget: 1.3, techAdoption: 0.7 },
      beauty: { urgency: 1.1, budget: 0.9, techAdoption: 1.2 },
      healthcare: { urgency: 1.3, budget: 1.2, techAdoption: 0.8 },
      veterinary: { urgency: 1.0, budget: 1.0, techAdoption: 0.9 },
      fitness: { urgency: 1.1, budget: 0.8, techAdoption: 1.1 },
      restaurant: { urgency: 0.9, budget: 0.7, techAdoption: 1.0 },
      retail: { urgency: 0.8, budget: 0.8, techAdoption: 1.1 },
      construction: { urgency: 0.7, budget: 1.0, techAdoption: 0.6 },
      technology: { urgency: 1.0, budget: 1.4, techAdoption: 1.5 }
    };
    
    return multipliers[industry] || { urgency: 1.0, budget: 1.0, techAdoption: 1.0 };
  }

  // Seasonal adjustments
  getSeasonalAdjustment(industry, month) {
    const seasonalFactors = {
      dental: { 0: 1.1, 1: 1.0, 2: 1.0, 3: 1.1, 4: 1.0, 5: 1.0, 6: 0.9, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.0, 11: 1.1 },
      legal: { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.9, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.0, 11: 1.0 },
      beauty: { 0: 1.2, 1: 1.1, 2: 1.0, 3: 1.1, 4: 1.0, 5: 1.0, 6: 1.1, 7: 1.2, 8: 1.1, 9: 1.0, 10: 1.0, 11: 1.2 },
      fitness: { 0: 1.3, 1: 1.4, 2: 1.2, 3: 1.0, 4: 0.9, 5: 0.8, 6: 0.7, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.1, 11: 1.2 }
    };
    
    const factors = seasonalFactors[industry];
    return factors ? factors[month] : 1.0;
  }
}

export default AdvancedLeadScoring;
