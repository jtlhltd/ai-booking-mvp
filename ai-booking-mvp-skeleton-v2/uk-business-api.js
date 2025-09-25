// UK Business Search API Integration
export class UKBusinessSearch {
    constructor() {
        this.apiKeys = {
            companiesHouse: process.env.COMPANIES_HOUSE_API_KEY,
            googlePlaces: process.env.GOOGLE_PLACES_API_KEY,
            yellowPages: process.env.YELLOW_PAGES_API_KEY
        };
        
        this.searchSources = {
            companiesHouse: 'https://api.company-information.service.gov.uk/search/companies',
            googlePlaces: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
            yellowPages: 'https://api.yell.com/v1/businesses/search',
            openCorporates: 'https://api.opencorporates.com/v0.4/companies/search'
        };
    }
    
    // Main search function
    async searchBusinesses(query, filters = {}) {
        const {
            location = 'all',
            businessSize = 'all',
            contactInfo = 'all',
            limit = 100,
            sources = ['googlePlaces', 'companiesHouse']
        } = filters;
        
        try {
            const searchPromises = sources.map(source => 
                this.searchSource(source, query, filters)
            );
            
            const results = await Promise.allSettled(searchPromises);
            const businesses = results
                .filter(result => result.status === 'fulfilled')
                .flatMap(result => result.value)
                .slice(0, limit);
            
            // Remove duplicates and enrich data
            const uniqueBusinesses = this.removeDuplicates(businesses);
            const enrichedBusinesses = await this.enrichBusinessData(uniqueBusinesses);
            
            return enrichedBusinesses;
        } catch (error) {
            console.error('Search error:', error);
            throw new Error('Failed to search businesses');
        }
    }
    
    // Search Google Places API
    async searchGooglePlaces(query, filters) {
        const { location, limit } = filters;
        const locationParam = location !== 'all' ? ` near ${location}` : '';
        const searchQuery = `${query}${locationParam}`;
        
        try {
            const response = await fetch(
                `${this.searchSources.googlePlaces}?query=${encodeURIComponent(searchQuery)}&key=${this.apiKeys.googlePlaces}&region=uk`
            );
            
            const data = await response.json();
            
            if (data.status !== 'OK') {
                throw new Error(`Google Places API error: ${data.status}`);
            }
            
            const businesses = data.results.map(place => ({
                name: place.name,
                address: place.formatted_address,
                phone: place.formatted_phone_number || null,
                website: place.website || null,
                rating: place.rating || 0,
                placeId: place.place_id,
                source: 'googlePlaces',
                coordinates: {
                    lat: place.geometry.location.lat,
                    lng: place.geometry.location.lng
                },
                types: place.types || []
            }));
            
            return businesses.slice(0, limit);
        } catch (error) {
            console.error('Google Places search error:', error);
            return [];
        }
    }
    
    // Search Companies House API
    async searchCompaniesHouse(query, filters) {
        const { limit } = filters;
        
        try {
            const response = await fetch(
                `${this.searchSources.companiesHouse}?q=${encodeURIComponent(query)}&items_per_page=${limit}`,
                {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
                    }
                }
            );
            
            const data = await response.json();
            
            if (!data.items) {
                throw new Error('Companies House API error');
            }
            
            const businesses = data.items.map(company => ({
                name: company.title,
                address: company.address_snippet,
                companyNumber: company.company_number,
                companyStatus: company.company_status,
                companyType: company.company_type,
                source: 'companiesHouse',
                dateOfCreation: company.date_of_creation,
                description: company.description
            }));
            
            return businesses;
        } catch (error) {
            console.error('Companies House search error:', error);
            return [];
        }
    }
    
    // Search Yellow Pages API
    async searchYellowPages(query, filters) {
        const { location, limit } = filters;
        
        try {
            const response = await fetch(
                `${this.searchSources.yellowPages}?what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKeys.yellowPages}`
                    }
                }
            );
            
            const data = await response.json();
            
            if (!data.businesses) {
                throw new Error('Yellow Pages API error');
            }
            
            const businesses = data.businesses.map(business => ({
                name: business.name,
                address: business.address,
                phone: business.phone || null,
                website: business.website || null,
                email: business.email || null,
                rating: business.rating || 0,
                source: 'yellowPages',
                categories: business.categories || [],
                description: business.description
            }));
            
            return businesses;
        } catch (error) {
            console.error('Yellow Pages search error:', error);
            return [];
        }
    }
    
    // Search OpenCorporates API
    async searchOpenCorporates(query, filters) {
        const { limit } = filters;
        
        try {
            const response = await fetch(
                `${this.searchSources.openCorporates}?q=${encodeURIComponent(query)}&per_page=${limit}&country_code=gb`
            );
            
            const data = await response.json();
            
            if (!data.results || !data.results.companies) {
                throw new Error('OpenCorporates API error');
            }
            
            const businesses = data.results.companies.map(company => ({
                name: company.company.name,
                address: company.company.registered_address_in_full,
                companyNumber: company.company.company_number,
                jurisdiction: company.company.jurisdiction_code,
                source: 'openCorporates',
                incorporationDate: company.company.incorporation_date,
                status: company.company.current_status
            }));
            
            return businesses;
        } catch (error) {
            console.error('OpenCorporates search error:', error);
            return [];
        }
    }
    
    // Search specific source
    async searchSource(source, query, filters) {
        switch (source) {
            case 'googlePlaces':
                return this.searchGooglePlaces(query, filters);
            case 'companiesHouse':
                return this.searchCompaniesHouse(query, filters);
            case 'yellowPages':
                return this.searchYellowPages(query, filters);
            case 'openCorporates':
                return this.searchOpenCorporates(query, filters);
            default:
                throw new Error(`Unknown source: ${source}`);
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
    
    // Enrich business data with additional information
    async enrichBusinessData(businesses) {
        const enrichedBusinesses = await Promise.all(
            businesses.map(async business => {
                try {
                    // Get additional details from Google Places if available
                    if (business.placeId) {
                        const details = await this.getGooglePlaceDetails(business.placeId);
                        business = { ...business, ...details };
                    }
                    
                    // Get company information from Companies House
                    if (business.companyNumber) {
                        const companyInfo = await this.getCompanyDetails(business.companyNumber);
                        business = { ...business, ...companyInfo };
                    }
                    
                    // Estimate employee count based on company type and size
                    business.estimatedEmployees = this.estimateEmployeeCount(business);
                    
                    // Determine business category
                    business.category = this.categorizeBusiness(business);
                    
                    // Calculate lead score
                    business.leadScore = this.calculateLeadScore(business);
                    
                    return business;
                } catch (error) {
                    console.error('Error enriching business data:', error);
                    return business;
                }
            })
        );
        
        return enrichedBusinesses;
    }
    
    // Get Google Place details
    async getGooglePlaceDetails(placeId) {
        try {
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,reviews,opening_hours,types&key=${this.apiKeys.googlePlaces}`
            );
            
            const data = await response.json();
            
            if (data.status !== 'OK') {
                throw new Error(`Google Places details error: ${data.status}`);
            }
            
            const place = data.result;
            return {
                phone: place.formatted_phone_number || null,
                website: place.website || null,
                rating: place.rating || 0,
                reviews: place.reviews || [],
                openingHours: place.opening_hours || null,
                types: place.types || []
            };
        } catch (error) {
            console.error('Google Places details error:', error);
            return {};
        }
    }
    
    // Get company details from Companies House
    async getCompanyDetails(companyNumber) {
        try {
            const response = await fetch(
                `https://api.company-information.service.gov.uk/company/${companyNumber}`,
                {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(this.apiKeys.companiesHouse + ':').toString('base64')}`
                    }
                }
            );
            
            const data = await response.json();
            
            return {
                companyStatus: data.company_status,
                companyType: data.type,
                dateOfCreation: data.date_of_creation,
                sicCodes: data.sic_codes || [],
                officers: data.officers || [],
                accounts: data.accounts || null
            };
        } catch (error) {
            console.error('Companies House details error:', error);
            return {};
        }
    }
    
    // Estimate employee count
    estimateEmployeeCount(business) {
        // Simple estimation based on company type and other factors
        if (business.companyType) {
            if (business.companyType.includes('micro')) return '1-10';
            if (business.companyType.includes('small')) return '11-50';
            if (business.companyType.includes('medium')) return '51-250';
            if (business.companyType.includes('large')) return '250+';
        }
        
        // Default estimation
        return '1-10';
    }
    
    // Categorize business
    categorizeBusiness(business) {
        const types = business.types || [];
        const name = business.name.toLowerCase();
        
        if (types.includes('dentist') || name.includes('dental')) return 'dental';
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
    
    // Export results to CSV
    exportToCSV(businesses, filename = 'uk-businesses.csv') {
        const headers = [
            'Name', 'Address', 'Phone', 'Email', 'Website', 'Category', 
            'Estimated Employees', 'Rating', 'Lead Score', 'Source'
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
                `"${business.source}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    // Export results to JSON
    exportToJSON(businesses, filename = 'uk-businesses.json') {
        return JSON.stringify(businesses, null, 2);
    }
}

// Usage example
export async function searchUKBusinesses(query, filters = {}) {
    const searcher = new UKBusinessSearch();
    return await searcher.searchBusinesses(query, filters);
}

// Server endpoint for UK business search
export function createUKBusinessSearchEndpoint(app) {
    app.post('/api/uk-business-search', async (req, res) => {
        try {
            const { query, filters } = req.body;
            
            if (!query) {
                return res.status(400).json({ error: 'Query is required' });
            }
            
            const searcher = new UKBusinessSearch();
            const results = await searcher.searchBusinesses(query, filters);
            
            res.json({
                success: true,
                results,
                count: results.length,
                query,
                filters
            });
        } catch (error) {
            console.error('UK Business Search error:', error);
            res.status(500).json({ 
                error: 'Failed to search businesses',
                message: error.message 
            });
        }
    });
    
    app.get('/api/uk-business-search/export/:format', async (req, res) => {
        try {
            const { format } = req.params;
            const { query, filters } = req.query;
            
            if (!query) {
                return res.status(400).json({ error: 'Query is required' });
            }
            
            const searcher = new UKBusinessSearch();
            const results = await searcher.searchBusinesses(query, filters);
            
            let content, contentType, filename;
            
            if (format === 'csv') {
                content = searcher.exportToCSV(results);
                contentType = 'text/csv';
                filename = `uk-businesses-${Date.now()}.csv`;
            } else if (format === 'json') {
                content = searcher.exportToJSON(results);
                contentType = 'application/json';
                filename = `uk-businesses-${Date.now()}.json`;
            } else {
                return res.status(400).json({ error: 'Invalid format' });
            }
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(content);
        } catch (error) {
            console.error('Export error:', error);
            res.status(500).json({ 
                error: 'Failed to export results',
                message: error.message 
            });
        }
    });
}
