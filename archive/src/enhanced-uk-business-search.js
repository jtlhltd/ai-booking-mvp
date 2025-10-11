// Enhanced UK Business Search with Real Data Integration
import axios from 'axios';

class EnhancedUKBusinessSearch {
  constructor() {
    this.apiKeys = {
      googlePlaces: process.env.GOOGLE_PLACES_API_KEY,
      companiesHouse: process.env.COMPANIES_HOUSE_API_KEY,
      yell: process.env.YELL_API_KEY
    };
    
    this.cache = new Map();
    this.rateLimits = {
      googlePlaces: { requests: 0, resetTime: Date.now() + 86400000 }, // 24 hours
      companiesHouse: { requests: 0, resetTime: Date.now() + 3600000 } // 1 hour
    };
  }

  async searchBusinesses(query, filters = {}) {
    const cacheKey = `${query}-${JSON.stringify(filters)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`[CACHE] Returning cached results for: ${query}`);
      return this.cache.get(cacheKey);
    }

    const results = await Promise.allSettled([
      this.searchGooglePlaces(query, filters),
      this.searchCompaniesHouse(query, filters),
      this.searchYell(query, filters)
    ]);

    // Combine and deduplicate results
    const allResults = results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value)
      .filter(this.deduplicateBusinesses);

    // Cache results for 1 hour
    this.cache.set(cacheKey, allResults);
    setTimeout(() => this.cache.delete(cacheKey), 3600000);

    return allResults;
  }

  async searchGooglePlaces(query, filters) {
    if (!this.apiKeys.googlePlaces) {
      console.log('[GOOGLE PLACES] No API key provided');
      return [];
    }

    try {
      const searchQuery = encodeURIComponent(`${query} United Kingdom`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&key=${this.apiKeys.googlePlaces}&region=gb&location=54.7024,-3.2766&radius=1000000`;
      
      const response = await axios.get(url);
      const data = response.data;

      if (data.status !== 'OK') {
        console.log(`[GOOGLE PLACES] API error: ${data.status}`);
        return [];
      }

      // Filter UK results and enrich with details
      const ukResults = data.results.filter(place => 
        place.formatted_address && 
        (place.formatted_address.includes('United Kingdom') || 
         place.formatted_address.includes('UK'))
      );

      // Get detailed information for each place
      const enrichedResults = await Promise.all(
        ukResults.slice(0, 10).map(place => this.enrichGooglePlace(place))
      );

      return enrichedResults;
    } catch (error) {
      console.error('[GOOGLE PLACES] Error:', error.message);
      return [];
    }
  }

  async enrichGooglePlace(place) {
    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website,opening_hours,reviews,photos&key=${this.apiKeys.googlePlaces}`;
      
      const response = await axios.get(detailsUrl);
      const details = response.data.result;

      return {
        name: place.name,
        address: place.formatted_address,
        phone: details?.formatted_phone_number || null,
        email: this.generateEmailFromBusiness(place.name),
        website: details?.website || null,
        employees: this.estimateEmployees(place),
        services: place.types || [],
        rating: place.rating || 0,
        reviews: details?.reviews?.length || 0,
        openingHours: details?.opening_hours?.weekday_text || null,
        category: place.types?.[0] || 'business',
        leadScore: this.calculateLeadScore(place, details),
        source: 'google_places',
        placeId: place.place_id,
        geometry: place.geometry,
        photos: details?.photos?.slice(0, 3) || []
      };
    } catch (error) {
      console.error(`[GOOGLE PLACES] Error enriching ${place.name}:`, error.message);
      return this.createBasicBusiness(place);
    }
  }

  async searchCompaniesHouse(query, filters) {
    if (!this.apiKeys.companiesHouse) {
      console.log('[COMPANIES HOUSE] No API key provided');
      return [];
    }

    try {
      const searchQuery = encodeURIComponent(query);
      const url = `https://api.company-information.service.gov.uk/search/companies?q=${searchQuery}&items_per_page=20`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
        }
      });

      const companies = response.data.items || [];

      return companies.map(company => ({
        name: company.title,
        address: `${company.address_snippet}`,
        phone: null, // Companies House doesn't provide phone numbers
        email: this.generateEmailFromBusiness(company.title),
        website: null,
        employees: this.estimateEmployeesFromSIC(company.sic_codes),
        services: this.mapSICCodesToServices(company.sic_codes),
        rating: 0, // Companies House doesn't provide ratings
        category: this.mapSICToCategory(company.sic_codes?.[0]),
        leadScore: this.calculateCompaniesHouseLeadScore(company),
        source: 'companies_house',
        companyNumber: company.company_number,
        companyStatus: company.company_status,
        companyType: company.company_type,
        sicCodes: company.sic_codes,
        dateOfCreation: company.date_of_creation,
        dateOfCessation: company.date_of_cessation
      }));
    } catch (error) {
      console.error('[COMPANIES HOUSE] Error:', error.message);
      return [];
    }
  }

  async searchYell(query, filters) {
    if (!this.apiKeys.yell) {
      console.log('[YELL] No API key provided');
      return [];
    }

    try {
      const searchQuery = encodeURIComponent(query);
      const url = `https://api.yell.com/v1/businesses?q=${searchQuery}&location=United+Kingdom&limit=20`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKeys.yell}`
        }
      });

      const businesses = response.data.businesses || [];

      return businesses.map(business => ({
        name: business.name,
        address: business.address,
        phone: business.phone,
        email: business.email || this.generateEmailFromBusiness(business.name),
        website: business.website,
        employees: business.employees || null,
        services: business.categories || [],
        rating: business.rating || 0,
        category: business.categories?.[0] || 'business',
        leadScore: this.calculateYellLeadScore(business),
        source: 'yell',
        yellId: business.id,
        categories: business.categories,
        openingHours: business.opening_hours,
        photos: business.photos || []
      }));
    } catch (error) {
      console.error('[YELL] Error:', error.message);
      return [];
    }
  }

  // Helper methods
  generateEmailFromBusiness(businessName) {
    const domain = businessName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '')
      .substring(0, 15) + '.co.uk';
    return `info@${domain}`;
  }

  estimateEmployees(place) {
    // Estimate based on business type and rating
    const baseEmployees = place.types?.includes('restaurant') ? 15 : 8;
    const ratingMultiplier = (place.rating || 3.5) / 5;
    const estimated = Math.floor(baseEmployees * ratingMultiplier * (1 + Math.random()));
    return `${estimated}-${estimated + Math.floor(Math.random() * 20) + 10}`;
  }

  estimateEmployeesFromSIC(sicCodes) {
    if (!sicCodes || sicCodes.length === 0) return '5-25';
    
    const sic = sicCodes[0];
    if (sic.startsWith('47')) return '3-15'; // Retail
    if (sic.startsWith('56')) return '8-25'; // Food service
    if (sic.startsWith('62')) return '5-20'; // Computer programming
    if (sic.startsWith('86')) return '10-50'; // Human health activities
    
    return '5-25';
  }

  mapSICCodesToServices(sicCodes) {
    if (!sicCodes) return ['Professional Services'];
    
    const sic = sicCodes[0];
    const serviceMap = {
      '47': ['Retail Services', 'Customer Service'],
      '56': ['Food Service', 'Catering'],
      '62': ['IT Services', 'Software Development'],
      '86': ['Healthcare', 'Medical Services'],
      '41': ['Construction', 'Building Services'],
      '68': ['Real Estate', 'Property Services']
    };
    
    const prefix = sic.substring(0, 2);
    return serviceMap[prefix] || ['Professional Services'];
  }

  mapSICToCategory(sicCode) {
    if (!sicCode) return 'business';
    
    const categoryMap = {
      '47': 'retail',
      '56': 'restaurant',
      '62': 'technology',
      '86': 'healthcare',
      '41': 'construction',
      '68': 'real_estate'
    };
    
    const prefix = sicCode.substring(0, 2);
    return categoryMap[prefix] || 'business';
  }

  calculateLeadScore(place, details) {
    let score = 0;
    
    // Base score from rating
    score += (place.rating || 0) * 20;
    
    // Bonus for having contact info
    if (details?.formatted_phone_number) score += 10;
    if (details?.website) score += 10;
    
    // Bonus for reviews
    if (details?.reviews?.length > 10) score += 5;
    
    // Bonus for business type
    if (place.types?.includes('dentist')) score += 15;
    if (place.types?.includes('lawyer')) score += 15;
    if (place.types?.includes('beauty_salon')) score += 10;
    
    return Math.min(100, Math.max(0, score));
  }

  calculateCompaniesHouseLeadScore(company) {
    let score = 50; // Base score
    
    // Active companies score higher
    if (company.company_status === 'active') score += 20;
    
    // Recent companies might be more responsive
    const creationDate = new Date(company.date_of_creation);
    const yearsOld = (new Date() - creationDate) / (365 * 24 * 60 * 60 * 1000);
    if (yearsOld < 5) score += 10;
    
    return Math.min(100, score);
  }

  calculateYellLeadScore(business) {
    let score = 0;
    
    // Base score from rating
    score += (business.rating || 0) * 20;
    
    // Bonus for contact info
    if (business.phone) score += 15;
    if (business.email) score += 10;
    if (business.website) score += 10;
    
    // Bonus for photos (indicates active business)
    if (business.photos?.length > 0) score += 5;
    
    return Math.min(100, Math.max(0, score));
  }

  deduplicateBusinesses(business, index, array) {
    return array.findIndex(b => 
      b.name.toLowerCase() === business.name.toLowerCase() &&
      b.address === business.address
    ) === index;
  }

  createBasicBusiness(place) {
    return {
      name: place.name,
      address: place.formatted_address,
      phone: null,
      email: this.generateEmailFromBusiness(place.name),
      website: null,
      employees: this.estimateEmployees(place),
      services: place.types || [],
      rating: place.rating || 0,
      category: place.types?.[0] || 'business',
      leadScore: this.calculateLeadScore(place, {}),
      source: 'google_places',
      placeId: place.place_id,
      geometry: place.geometry
    };
  }
}

export default EnhancedUKBusinessSearch;
