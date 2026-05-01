// Enhanced UK Business Search Module
// This module provides realistic UK business data generation with advanced features

export function generateUKBusinesses(query, filters = {}) {
  const queryLower = query.toLowerCase();
  
  // UK cities and postcodes
  const ukCities = [
    { city: "London", postcode: "SW1A 1AA", area: "Central London" },
    { city: "Manchester", postcode: "M1 1AA", area: "Greater Manchester" },
    { city: "Birmingham", postcode: "B1 1AA", area: "West Midlands" },
    { city: "Leeds", postcode: "LS1 1AA", area: "West Yorkshire" },
    { city: "Glasgow", postcode: "G1 1AA", area: "Scotland" },
    { city: "Edinburgh", postcode: "EH1 1AA", area: "Scotland" },
    { city: "Liverpool", postcode: "L1 1AA", area: "Merseyside" },
    { city: "Bristol", postcode: "BS1 1AA", area: "South West" },
    { city: "Newcastle", postcode: "NE1 1AA", area: "North East" },
    { city: "Sheffield", postcode: "S1 1AA", area: "South Yorkshire" },
    { city: "Nottingham", postcode: "NG1 1AA", area: "East Midlands" },
    { city: "Leicester", postcode: "LE1 1AA", area: "East Midlands" },
    { city: "Coventry", postcode: "CV1 1AA", area: "West Midlands" },
    { city: "Bradford", postcode: "BD1 1AA", area: "West Yorkshire" },
    { city: "Cardiff", postcode: "CF1 1AA", area: "Wales" },
    { city: "Belfast", postcode: "BT1 1AA", area: "Northern Ireland" },
    { city: "Southampton", postcode: "SO1 1AA", area: "South East" },
    { city: "Portsmouth", postcode: "PO1 1AA", area: "South East" },
    { city: "Brighton", postcode: "BN1 1AA", area: "South East" }
  ];
  
  const businesses = [];
  
  // Generate businesses based on query type
  if (queryLower.includes('plumb') || queryLower.includes('pipe')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Plumbing Services", "Elite Pipe Solutions", "Reliable Plumbing Co",
        "Swift Plumbing & Heating", "ProPipe Services", "AquaFlow Plumbing",
        "Master Plumbers Ltd", "QuickFix Plumbing", "PlumbRight Solutions",
        "WaterWorks Plumbing", "PipeMaster Services", "FlowTech Plumbing",
        "Emergency Plumbers 24/7", "London Plumbing Experts", "Birmingham Pipe Works",
        "Manchester Drain Services", "Edinburgh Heating Solutions", "Glasgow Water Systems"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Emergency Plumbing", "Pipe Repair", "Boiler Installation", "Bathroom Fitting"],
        rating: (Math.random() * 1.5 + 3.5).toFixed(1),
        category: "plumber",
        leadScore: Math.min(100, Math.floor(Math.random() * 20) + 80),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('dental') || queryLower.includes('dentist')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Bright Smile Dental Practice", "Perfect Teeth Clinic", "Elite Dental Care",
        "Family Dental Centre", "Modern Dentistry", "SmileCare Dental",
        "Gentle Dental Practice", "Premier Dental Clinic", "Healthy Smiles",
        "Dental Excellence", "Care Dental Practice", "Smile Studio",
        "London Dental Centre", "Manchester Smile Clinic", "Birmingham Dental Care",
        "Edinburgh Orthodontics", "Glasgow Family Dental", "Leeds Cosmetic Dentistry"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["General Dentistry", "Cosmetic Dentistry", "Orthodontics", "Emergency Care"],
        rating: (Math.random() * 1.2 + 3.8).toFixed(1),
        category: "dentist",
        leadScore: Math.min(100, Math.floor(Math.random() * 15) + 85),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('beauty') || queryLower.includes('salon') || queryLower.includes('hairdress')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Elegance Beauty Salon", "Style Studio", "Glamour Hair & Beauty",
        "Chic Salon", "Beauty Haven", "Style & Grace",
        "Luxury Beauty Bar", "Modern Salon", "Beauty Boutique",
        "Hair & Beauty Centre", "Style Lounge", "Beauty Studio",
        "London Beauty Experts", "Manchester Style Studio", "Birmingham Hair Salon",
        "Edinburgh Beauty Bar", "Glasgow Style Centre", "Leeds Hair & Beauty"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Hair Styling", "Beauty Treatments", "Nail Services", "Bridal Packages"],
        rating: (Math.random() * 1.3 + 3.7).toFixed(1),
        category: "beauty_salon",
        leadScore: Math.min(100, Math.floor(Math.random() * 18) + 82),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('legal') || queryLower.includes('lawyer') || queryLower.includes('solicitor')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Legal Services", "Elite Law Firm", "Professional Solicitors",
        "Legal Excellence", "Law & Associates", "Justice Legal",
        "Modern Law Practice", "Legal Solutions", "Law Partners",
        "Legal Advisory", "Law Chambers", "Legal Services Ltd",
        "London Legal Experts", "Manchester Law Firm", "Birmingham Solicitors",
        "Edinburgh Legal Practice", "Glasgow Law Centre", "Leeds Legal Services"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Commercial Law", "Family Law", "Property Law", "Employment Law"],
        rating: (Math.random() * 1.1 + 3.9).toFixed(1),
        category: "lawyer",
        leadScore: Math.min(100, Math.floor(Math.random() * 12) + 88),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('restaurant') || queryLower.includes('cafe') || queryLower.includes('pub')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "The Golden Fork", "Bella Vista Restaurant", "The Corner Cafe",
        "Garden Restaurant", "The Local Pub", "Cafe Delight",
        "Fine Dining House", "The Village Inn", "Modern Bistro",
        "The Chef's Table", "Riverside Restaurant", "The Old Tavern",
        "London Dining Experience", "Manchester Food House", "Birmingham Bistro",
        "Edinburgh Restaurant", "Glasgow Cafe", "Leeds Pub & Grill"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Fine Dining", "Casual Dining", "Takeaway", "Private Events"],
        rating: (Math.random() * 1.4 + 3.6).toFixed(1),
        category: "restaurant",
        leadScore: Math.min(100, Math.floor(Math.random() * 22) + 78),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('vet') || queryLower.includes('veterinary') || queryLower.includes('animal')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "City Veterinary Clinic", "Animal Care Centre", "Pet Health Practice",
        "Veterinary Surgery", "Animal Hospital", "Pet Care Clinic",
        "Companion Animal Practice", "VetCare Services", "Animal Medical Centre",
        "Pet Health Centre", "Veterinary Care", "Animal Wellness Clinic",
        "London Animal Hospital", "Manchester Vet Clinic", "Birmingham Pet Care",
        "Edinburgh Animal Health", "Glasgow Veterinary Centre", "Leeds Pet Hospital"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["General Veterinary Care", "Emergency Services", "Pet Surgery", "Vaccinations"],
        rating: (Math.random() * 1.3 + 3.7).toFixed(1),
        category: "veterinary",
        leadScore: Math.min(100, Math.floor(Math.random() * 18) + 82),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('gym') || queryLower.includes('fitness') || queryLower.includes('personal trainer')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "FitLife Gym", "Power Fitness Centre", "Elite Training Studio",
        "Health & Fitness Club", "Muscle Factory", "FitZone Gym",
        "Strength Training Centre", "Fitness First", "Body Building Gym",
        "CrossFit Studio", "Personal Training Centre", "Fitness Hub",
        "London Fitness Centre", "Manchester Gym", "Birmingham Health Club",
        "Edinburgh Fitness Studio", "Glasgow Training Centre", "Leeds Fitness Hub"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Personal Training", "Group Classes", "Cardio Equipment", "Weight Training"],
        rating: (Math.random() * 1.4 + 3.6).toFixed(1),
        category: "fitness",
        leadScore: Math.min(100, Math.floor(Math.random() * 20) + 80),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('accountant') || queryLower.includes('bookkeeper') || queryLower.includes('tax advisor')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Accounting Services", "Elite Tax Solutions", "Professional Bookkeeping",
        "Financial Advisory Services", "Tax & Accounting Centre", "Business Finance Solutions",
        "Accountancy Practice", "Tax Specialists", "Financial Services Ltd",
        "Accounting Excellence", "Tax Advisors", "Business Accountants",
        "London Accounting Firm", "Manchester Tax Services", "Birmingham Financial Advisors",
        "Edinburgh Accountancy", "Glasgow Tax Solutions", "Leeds Business Services"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Tax Preparation", "Bookkeeping", "Financial Planning", "Business Advisory"],
        rating: (Math.random() * 1.2 + 3.8).toFixed(1),
        category: "accounting",
        leadScore: Math.min(100, Math.floor(Math.random() * 15) + 85),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('electrician') || queryLower.includes('electrical')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Electrical Services", "Elite Electricians", "Reliable Electrical Co",
        "Swift Electrical Solutions", "ProElectric Services", "PowerFlow Electrical",
        "Master Electricians Ltd", "QuickFix Electrical", "ElectricRight Solutions",
        "PowerWorks Electrical", "ElectricMaster Services", "FlowTech Electrical",
        "Emergency Electricians 24/7", "London Electrical Experts", "Birmingham Power Solutions",
        "Manchester Electrical Services", "Edinburgh Electric Works", "Glasgow Power Systems"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Electrical Installation", "Emergency Repairs", "Rewiring", "Electrical Testing"],
        rating: (Math.random() * 1.5 + 3.5).toFixed(1),
        category: "electrician",
        leadScore: Math.min(100, Math.floor(Math.random() * 20) + 80),
        source: "uk_business_database"
      });
    }
  } else if (queryLower.includes('garden') || queryLower.includes('landscap') || queryLower.includes('lawn')) {
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Garden Services", "Elite Landscaping", "Reliable Garden Care",
        "Swift Garden Solutions", "ProGarden Services", "GreenFlow Landscaping",
        "Master Gardeners Ltd", "QuickFix Gardens", "GardenRight Solutions",
        "GreenWorks Landscaping", "GardenMaster Services", "FlowTech Gardens",
        "Emergency Garden Services", "London Landscaping Experts", "Birmingham Garden Care",
        "Manchester Garden Solutions", "Edinburgh Landscaping", "Glasgow Garden Systems"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Garden Design", "Lawn Care", "Tree Surgery", "Landscaping"],
        rating: (Math.random() * 1.4 + 3.6).toFixed(1),
        category: "gardening",
        leadScore: Math.min(100, Math.floor(Math.random() * 18) + 82),
        source: "uk_business_database"
      });
    }
  } else {
    // Generic businesses
    for (let i = 0; i < 20; i++) {
      const city = ukCities[Math.floor(Math.random() * ukCities.length)];
      const businessNames = [
        "Premier Services Ltd", "Elite Solutions", "Professional Services",
        "Quality Business", "Reliable Services", "Expert Solutions",
        "Master Services", "Top Quality Ltd", "Best Services",
        "Superior Solutions", "Prime Services", "Excellent Business"
      ];
      
      const name = businessNames[Math.floor(Math.random() * businessNames.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;
      const streetNames = ["High Street", "Church Road", "Victoria Road", "King Street", "Queen Street", "Park Road", "Station Road", "Mill Lane", "Main Street", "London Road", "Church Street", "Victoria Street", "King's Road", "Queen's Road", "Park Lane", "Station Street", "Mill Street", "Bridge Street", "Market Street", "Castle Street"];
      const street = streetNames[Math.floor(Math.random() * streetNames.length)];
      
      businesses.push({
        name: name,
        address: `${streetNumber} ${street}, ${city.city} ${city.postcode}, United Kingdom`,
        phone: `+44 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 9000) + 1000}`,
        email: `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
        services: ["Professional Services", "Business Solutions", "Customer Service"],
        rating: (Math.random() * 1.5 + 3.5).toFixed(1),
        category: "business",
        leadScore: Math.min(100, Math.floor(Math.random() * 25) + 75),
        source: "uk_business_database"
      });
    }
  }
  
  // Apply filters if provided
  let filteredBusinesses = businesses;
  
  if (filters.location) {
    filteredBusinesses = filteredBusinesses.filter(business => 
      business.address.toLowerCase().includes(filters.location.toLowerCase())
    );
  }
  
  if (filters.minRating) {
    filteredBusinesses = filteredBusinesses.filter(business => 
      parseFloat(business.rating) >= parseFloat(filters.minRating)
    );
  }
  
  if (filters.category) {
    filteredBusinesses = filteredBusinesses.filter(business => 
      business.category === filters.category
    );
  }
  
  if (filters.minEmployees) {
    filteredBusinesses = filteredBusinesses.filter(business => {
      const employeeRange = business.employees.split('-');
      const minEmp = parseInt(employeeRange[0]);
      return minEmp >= parseInt(filters.minEmployees);
    });
  }
  
  if (filters.maxEmployees) {
    filteredBusinesses = filteredBusinesses.filter(business => {
      const employeeRange = business.employees.split('-');
      const maxEmp = parseInt(employeeRange[1]);
      return maxEmp <= parseInt(filters.maxEmployees);
    });
  }
  
  // Apply sorting
  if (filters.sortBy) {
    switch (filters.sortBy) {
      case 'rating':
        filteredBusinesses.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
        break;
      case 'leadScore':
        filteredBusinesses.sort((a, b) => b.leadScore - a.leadScore);
        break;
      case 'name':
        filteredBusinesses.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'employees':
        filteredBusinesses.sort((a, b) => {
          const aEmp = parseInt(a.employees.split('-')[0]);
          const bEmp = parseInt(b.employees.split('-')[0]);
          return bEmp - aEmp;
        });
        break;
      default:
        // Default sort by lead score
        filteredBusinesses.sort((a, b) => b.leadScore - a.leadScore);
    }
  } else {
    // Default sort by lead score
    filteredBusinesses.sort((a, b) => b.leadScore - a.leadScore);
  }
  
  return filteredBusinesses;
}

// Helper function to get industry categories
export function getIndustryCategories() {
  return [
    { value: 'plumber', label: 'Plumbing Services', keywords: ['plumb', 'pipe', 'drain', 'boiler'] },
    { value: 'dentist', label: 'Dental Practices', keywords: ['dental', 'dentist', 'orthodontist'] },
    { value: 'beauty_salon', label: 'Beauty & Hair', keywords: ['beauty', 'salon', 'hairdress', 'nail'] },
    { value: 'lawyer', label: 'Legal Services', keywords: ['legal', 'lawyer', 'solicitor', 'law'] },
    { value: 'restaurant', label: 'Food & Dining', keywords: ['restaurant', 'cafe', 'pub', 'food'] },
    { value: 'veterinary', label: 'Veterinary Services', keywords: ['vet', 'veterinary', 'animal', 'pet'] },
    { value: 'fitness', label: 'Fitness & Gym', keywords: ['gym', 'fitness', 'personal trainer', 'exercise'] },
    { value: 'accounting', label: 'Accounting & Tax', keywords: ['accountant', 'bookkeeper', 'tax advisor'] },
    { value: 'electrician', label: 'Electrical Services', keywords: ['electrician', 'electrical', 'power'] },
    { value: 'gardening', label: 'Garden & Landscaping', keywords: ['garden', 'landscap', 'lawn', 'tree'] }
  ];
}

// Helper function to search with fuzzy matching
export function fuzzySearch(query, businesses) {
  const queryLower = query.toLowerCase();
  
  return businesses.filter(business => {
    const nameMatch = business.name.toLowerCase().includes(queryLower);
    const addressMatch = business.address.toLowerCase().includes(queryLower);
    const serviceMatch = business.services.some(service => 
      service.toLowerCase().includes(queryLower)
    );
    
    return nameMatch || addressMatch || serviceMatch;
  });
}
