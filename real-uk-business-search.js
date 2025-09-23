// Real UK Business Search with Live APIs (ESM)
import axios from 'axios';
import { promises as fs } from 'fs';

class RealUKBusinessSearch {
    constructor() {
        this.apiKeys = {
            googlePlaces: process.env.GOOGLE_PLACES_API_KEY,
            companiesHouse: process.env.COMPANIES_HOUSE_API_KEY,
            yell: process.env.YELL_API_KEY,
            openCorporates: process.env.OPEN_CORPORATES_API_KEY
        };
        
        this.cache = new Map();
        this.rateLimits = {
            googlePlaces: { requests: 0, resetTime: Date.now() + 86400000 }, // 24 hours
            companiesHouse: { requests: 0, resetTime: Date.now() + 3600000 } // 1 hour
        };
    }
    
    // Main search function with real APIs
    async searchRealBusinesses(query, filters = {}) {
        const {
            location = 'all',
            businessSize = 'all',
            contactInfo = 'all',
            limit = 100,
            sources = ['googlePlaces', 'companiesHouse', 'yell']
        } = filters;
        
        console.log(`[REAL SEARCH] Starting search for: "${query}" with filters:`, filters);
        
        try {
            const searchPromises = sources.map(source => 
                this.searchRealSource(source, query, filters)
            );
            
            const results = await Promise.allSettled(searchPromises);
            const businesses = results
                .filter(result => result.status === 'fulfilled')
                .flatMap(result => result.value)
                .filter(business => business && business.name); // Filter out null results
            
            console.log(`[REAL SEARCH] Found ${businesses.length} businesses from APIs`);
            
            // Remove duplicates and enrich data
            const uniqueBusinesses = this.removeDuplicates(businesses);
            const enrichedBusinesses = await this.enrichBusinessData(uniqueBusinesses);
            
            // Apply final filters
            const filteredBusinesses = this.applyFinalFilters(enrichedBusinesses, filters);
            
            console.log(`[REAL SEARCH] Final results: ${filteredBusinesses.length} businesses`);
            
            return filteredBusinesses.slice(0, limit);
        } catch (error) {
            console.error('[REAL SEARCH ERROR]', error);
            throw new Error(`Failed to search real businesses: ${error.message}`);
        }
    }
    
    // Search Google Places API for real UK businesses
    async searchGooglePlaces(query, filters) {
        if (!this.apiKeys.googlePlaces) {
            console.log('[GOOGLE PLACES] No API key provided, skipping');
            return [];
        }
        
        try {
            const locationParam = filters.location !== 'all' ? ` near ${filters.location}, UK` : ' in UK';
            const searchQuery = `${query}${locationParam}`;
            
            console.log(`[GOOGLE PLACES] Searching: "${searchQuery}"`);
            
            const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
                params: {
                    query: searchQuery,
                    key: this.apiKeys.googlePlaces,
                    region: 'uk',
                    type: 'establishment'
                },
                timeout: 10000
            });
            
            if (response.data.status !== 'OK') {
                throw new Error(`Google Places API error: ${response.data.status}`);
            }
            
            const businesses = await Promise.all(
                response.data.results.map(async (place) => {
                    try {
                        // Get detailed information for each place
                        const details = await this.getGooglePlaceDetails(place.place_id);
                        
                        return {
                            name: place.name,
                            address: place.formatted_address,
                            phone: details.phone || null,
                            email: details.email || null,
                            website: details.website || null,
                            rating: place.rating || 0,
                            placeId: place.place_id,
                            source: 'googlePlaces',
                            coordinates: {
                                lat: place.geometry.location.lat,
                                lng: place.geometry.location.lng
                            },
                            types: place.types || [],
                            openingHours: details.openingHours || null,
                            reviews: details.reviews || [],
                            photos: place.photos || []
                        };
                    } catch (error) {
                        console.error(`[GOOGLE PLACES] Error getting details for ${place.name}:`, error.message);
                        return {
                            name: place.name,
                            address: place.formatted_address,
                            phone: null,
                            email: null,
                            website: null,
                            rating: place.rating || 0,
                            placeId: place.place_id,
                            source: 'googlePlaces',
                            coordinates: {
                                lat: place.geometry.location.lat,
                                lng: place.geometry.location.lng
                            },
                            types: place.types || []
                        };
                    }
                })
            );
            
            console.log(`[GOOGLE PLACES] Found ${businesses.length} businesses`);
            return businesses;
        } catch (error) {
            console.error('[GOOGLE PLACES ERROR]', error.message);
            return [];
        }
    }
    
    // Get detailed Google Place information
    async getGooglePlaceDetails(placeId) {
        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
                params: {
                    place_id: placeId,
                    fields: 'name,formatted_address,formatted_phone_number,website,rating,reviews,opening_hours,types,photos',
                    key: this.apiKeys.googlePlaces
                },
                timeout: 5000
            });
            
            if (response.data.status !== 'OK') {
                throw new Error(`Google Places details error: ${response.data.status}`);
            }
            
            const place = response.data.result;
            
            // Try to extract email from website or reviews
            let email = null;
            if (place.website) {
                email = await this.extractEmailFromWebsite(place.website);
            }
            
            return {
                phone: place.formatted_phone_number || null,
                email: email,
                website: place.website || null,
                rating: place.rating || 0,
                reviews: place.reviews || [],
                openingHours: place.opening_hours || null,
                types: place.types || [],
                photos: place.photos || []
            };
        } catch (error) {
            console.error(`[GOOGLE PLACES DETAILS ERROR]`, error.message);
            return {};
        }
    }
    
    // Search Companies House API for UK companies
    async searchCompaniesHouse(query, filters) {
        if (!this.apiKeys.companiesHouse) {
            console.log('[COMPANIES HOUSE] No API key provided, skipping');
            return [];
        }
        
        try {
            console.log(`[COMPANIES HOUSE] Searching: "${query}"`);
            
            const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
                params: {
                    q: query,
                    items_per_page: Math.min(filters.limit || 100, 100)
                },
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
                },
                timeout: 10000
            });
            
            if (!response.data.items) {
                throw new Error('Companies House API error: No items returned');
            }
            
            const businesses = await Promise.all(
                response.data.items.map(async (company) => {
                    try {
                        // Get detailed company information
                        const companyDetails = await this.getCompanyDetails(company.company_number);
                        
                        return {
                            name: company.title,
                            address: company.address_snippet,
                            phone: companyDetails.phone || null,
                            email: companyDetails.email || null,
                            website: companyDetails.website || null,
                            companyNumber: company.company_number,
                            companyStatus: company.company_status,
                            companyType: company.company_type,
                            source: 'companiesHouse',
                            dateOfCreation: company.date_of_creation,
                            description: company.description,
                            sicCodes: companyDetails.sicCodes || [],
                            officers: companyDetails.officers || []
                        };
                    } catch (error) {
                        console.error(`[COMPANIES HOUSE] Error getting details for ${company.title}:`, error.message);
                        return {
                            name: company.title,
                            address: company.address_snippet,
                            phone: null,
                            email: null,
                            website: null,
                            companyNumber: company.company_number,
                            companyStatus: company.company_status,
                            companyType: company.company_type,
                            source: 'companiesHouse',
                            dateOfCreation: company.date_of_creation,
                            description: company.description
                        };
                    }
                })
            );
            
            console.log(`[COMPANIES HOUSE] Found ${businesses.length} companies`);
            return businesses;
        } catch (error) {
            console.error('[COMPANIES HOUSE ERROR]', error.message);
            return [];
        }
    }
    
    // Get detailed company information from Companies House
    async getCompanyDetails(companyNumber) {
        try {
            const response = await axios.get(`https://api.company-information.service.gov.uk/company/${companyNumber}`, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
                },
                timeout: 5000
            });
            
            const company = response.data;
            
            // Try to extract contact information from company data
            let phone = null;
            let email = null;
            let website = null;
            
            // Look for contact info in company data
            if (company.contact_details) {
                phone = company.contact_details.phone || null;
                email = company.contact_details.email || null;
                website = company.contact_details.website || null;
            }
            
            // Look for website in company name or description
            if (!website && company.company_name) {
                const websiteMatch = company.company_name.match(/(https?:\/\/[^\s]+)/);
                if (websiteMatch) {
                    website = websiteMatch[1];
                }
            }
            
            return {
                phone,
                email,
                website,
                sicCodes: company.sic_codes || [],
                officers: company.officers || [],
                companyStatus: company.company_status,
                companyType: company.type
            };
        } catch (error) {
            console.error(`[COMPANIES HOUSE DETAILS ERROR]`, error.message);
            return {};
        }
    }
    
    // Search Yell.com API for UK businesses
    async searchYell(query, filters) {
        if (!this.apiKeys.yell) {
            console.log('[YELL] No API key provided, skipping');
            return [];
        }
        
        try {
            console.log(`[YELL] Searching: "${query}"`);
            
            const location = filters.location !== 'all' ? filters.location : 'UK';
            
            const response = await axios.get('https://api.yell.com/v1/businesses/search', {
                params: {
                    what: query,
                    where: location,
                    limit: Math.min(filters.limit || 100, 100)
                },
                headers: {
                    'Authorization': `Bearer ${this.apiKeys.yell}`
                },
                timeout: 10000
            });
            
            if (!response.data.businesses) {
                throw new Error('Yell API error: No businesses returned');
            }
            
            const businesses = response.data.businesses.map(business => ({
                name: business.name,
                address: business.address,
                phone: business.phone || null,
                email: business.email || null,
                website: business.website || null,
                rating: business.rating || 0,
                source: 'yell',
                categories: business.categories || [],
                description: business.description,
                openingHours: business.opening_hours || null
            }));
            
            console.log(`[YELL] Found ${businesses.length} businesses`);
            return businesses;
        } catch (error) {
            console.error('[YELL ERROR]', error.message);
            return [];
        }
    }
    
    // Search specific source
    async searchRealSource(source, query, filters) {
        switch (source) {
            case 'googlePlaces':
                return this.searchGooglePlaces(query, filters);
            case 'companiesHouse':
                return this.searchCompaniesHouse(query, filters);
            case 'yell':
                return this.searchYell(query, filters);
            default:
                throw new Error(`Unknown source: ${source}`);
        }
    }
    
    // Extract email from website
    async extractEmailFromWebsite(website) {
        try {
            const response = await axios.get(website, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const emails = response.data.match(emailRegex);
            
            if (emails && emails.length > 0) {
                // Return the first business-looking email
                return emails.find(email => 
                    !email.includes('noreply') && 
                    !email.includes('no-reply') &&
                    !email.includes('example.com')
                ) || emails[0];
            }
            
            return null;
        } catch (error) {
            console.error(`[EMAIL EXTRACTION ERROR]`, error.message);
            return null;
        }
    }
    
    // Remove duplicate businesses
    removeDuplicates(businesses) {
        const seen = new Set();
        return businesses.filter(business => {
            const key = `${business.name.toLowerCase()}-${business.address.toLowerCase()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    
    // Enrich business data
    async enrichBusinessData(businesses) {
        return businesses.map(business => {
            // Estimate employee count
            business.estimatedEmployees = this.estimateEmployeeCount(business);
            
            // Categorize business
            business.category = this.categorizeBusiness(business);
            
            // Calculate lead score
            business.leadScore = this.calculateLeadScore(business);
            
            // Add timestamp
            business.foundAt = new Date().toISOString();
            
            return business;
        });
    }
    
    // Apply final filters
    applyFinalFilters(businesses, filters) {
        return businesses.filter(business => {
            // Location filter
            if (filters.location && filters.location !== 'all') {
                if (!business.address.toLowerCase().includes(filters.location.toLowerCase())) {
                    return false;
                }
            }
            
            // Contact info filter
            if (filters.contactInfo && filters.contactInfo !== 'all') {
                if (filters.contactInfo === 'phone' && !business.phone) return false;
                if (filters.contactInfo === 'email' && !business.email) return false;
                if (filters.contactInfo === 'both' && (!business.phone || !business.email)) return false;
            }
            
            // Business size filter
            if (filters.businessSize && filters.businessSize !== 'all') {
                const employees = business.estimatedEmployees;
                if (filters.businessSize === 'small' && !employees.includes('1-10')) return false;
                if (filters.businessSize === 'medium' && !employees.includes('11-50')) return false;
                if (filters.businessSize === 'large' && !employees.includes('50+')) return false;
            }
            
            return true;
        });
    }
    
    // Estimate employee count
    estimateEmployeeCount(business) {
        if (business.companyType) {
            if (business.companyType.includes('micro')) return '1-10';
            if (business.companyType.includes('small')) return '11-50';
            if (business.companyType.includes('medium')) return '51-250';
            if (business.companyType.includes('large')) return '250+';
        }
        
        // Default estimation based on business type
        const types = business.types || [];
        if (types.includes('hospital') || types.includes('university')) return '250+';
        if (types.includes('school') || types.includes('restaurant')) return '11-50';
        
        return '1-10';
    }
    
    // Categorize business
    categorizeBusiness(business) {
        const types = business.types || [];
        const name = business.name.toLowerCase();
        const description = business.description || '';
        
        if (types.includes('dentist') || name.includes('dental') || description.includes('dental')) return 'dental';
        if (types.includes('lawyer') || name.includes('law') || name.includes('solicitor')) return 'legal';
        if (types.includes('beauty_salon') || name.includes('beauty') || name.includes('salon')) return 'beauty';
        if (types.includes('hospital') || types.includes('doctor') || name.includes('medical')) return 'medical';
        if (types.includes('gym') || types.includes('fitness')) return 'fitness';
        if (types.includes('restaurant') || types.includes('food')) return 'restaurant';
        if (types.includes('garden') || name.includes('garden')) return 'gardening';
        if (types.includes('plumber') || name.includes('plumb')) return 'plumbing';
        if (types.includes('electrician') || name.includes('electrical')) return 'electrical';
        
        return 'other';
    }
    
    // Calculate lead score
    calculateLeadScore(business) {
        let score = 50; // Base score
        
        // Contact information
        if (business.phone) score += 20;
        if (business.email) score += 20;
        if (business.website) score += 10;
        
        // Business information
        if (business.rating && business.rating > 4) score += 15;
        if (business.companyStatus === 'active') score += 10;
        
        // Business size
        const employees = business.estimatedEmployees;
        if (employees === '11-50') score += 10;
        if (employees === '51-250') score += 15;
        if (employees === '250+') score += 20;
        
        // Category relevance
        const relevantCategories = ['dental', 'legal', 'beauty', 'medical', 'fitness'];
        if (relevantCategories.includes(business.category)) score += 15;
        
        return Math.min(100, score);
    }
    
    // Export results
    exportToCSV(businesses, filename = 'real-uk-businesses.csv') {
        const headers = [
            'Name', 'Address', 'Phone', 'Email', 'Website', 'Category', 
            'Estimated Employees', 'Rating', 'Lead Score', 'Source', 'Found At'
        ];
        
        const csvRows = [headers.join(',')];
        
        businesses.forEach(business => {
            const row = [
                `"${business.name}"`,
                `"${business.address}"`,
                `"${business.phone || ''}"`,
                `"${business.email || ''}"`,
                `"${business.website || ''}"`,
                `"${business.category}"`,
                `"${business.estimatedEmployees}"`,
                business.rating || 0,
                business.leadScore || 0,
                `"${business.source}"`,
                `"${business.foundAt}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
}

export default RealUKBusinessSearch;
