// Enhanced UK Business Search Module
// This module provides realistic UK business data generation

export function generateUKBusinesses(query) {
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
        employees: `${Math.floor(Math.random() * 15) + 5}-${Math.floor(Math.random() * 25) + 20}`,
        services: ["Emergency Plumbing", "Pipe Repair", "Boiler Installation", "Bathroom Fitting"],
        rating: (Math.random() * 1.5 + 3.5).toFixed(1),
        category: "plumber",
        leadScore: Math.floor(Math.random() * 20) + 80,
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
        employees: `${Math.floor(Math.random() * 10) + 8}-${Math.floor(Math.random() * 15) + 20}`,
        services: ["General Dentistry", "Cosmetic Dentistry", "Orthodontics", "Emergency Care"],
        rating: (Math.random() * 1.2 + 3.8).toFixed(1),
        category: "dentist",
        leadScore: Math.floor(Math.random() * 15) + 85,
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
        employees: `${Math.floor(Math.random() * 8) + 3}-${Math.floor(Math.random() * 12) + 15}`,
        services: ["Hair Styling", "Beauty Treatments", "Nail Services", "Bridal Packages"],
        rating: (Math.random() * 1.3 + 3.7).toFixed(1),
        category: "beauty_salon",
        leadScore: Math.floor(Math.random() * 18) + 82,
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
        employees: `${Math.floor(Math.random() * 15) + 10}-${Math.floor(Math.random() * 25) + 30}`,
        services: ["Commercial Law", "Family Law", "Property Law", "Employment Law"],
        rating: (Math.random() * 1.1 + 3.9).toFixed(1),
        category: "lawyer",
        leadScore: Math.floor(Math.random() * 12) + 88,
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
        employees: `${Math.floor(Math.random() * 20) + 8}-${Math.floor(Math.random() * 30) + 25}`,
        services: ["Fine Dining", "Casual Dining", "Takeaway", "Private Events"],
        rating: (Math.random() * 1.4 + 3.6).toFixed(1),
        category: "restaurant",
        leadScore: Math.floor(Math.random() * 22) + 78,
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
        employees: `${Math.floor(Math.random() * 20) + 5}-${Math.floor(Math.random() * 30) + 25}`,
        services: ["Professional Services", "Business Solutions", "Customer Service"],
        rating: (Math.random() * 1.5 + 3.5).toFixed(1),
        category: "business",
        leadScore: Math.floor(Math.random() * 25) + 75,
        source: "uk_business_database"
      });
    }
  }
  
  return businesses;
}
