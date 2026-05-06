export function generateRealisticDecisionMakers(business, industry, targetRole) {
  const commonNames = ['John', 'Sarah', 'Michael', 'Emma', 'David', 'Lisa', 'James', 'Anna', 'Robert', 'Maria', 'Chris', 'Jennifer', 'Mark', 'Laura', 'Paul', 'Nicola'];
  const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Hernandez'];

  const industryTitles = {
    dentist: {
      primary: ['Practice Owner', 'Principal Dentist', 'Clinical Director', 'Managing Partner', 'Owner', 'Manager'],
      secondary: ['Practice Manager', 'Clinical Lead', 'Senior Dentist'],
      gatekeeper: ['Reception Manager', 'Patient Coordinator', 'Office Manager']
    },
    plumber: {
      primary: ['Business Owner', 'Managing Director', 'Company Director'],
      secondary: ['Operations Manager', 'Service Manager', 'Team Leader'],
      gatekeeper: ['Office Manager', 'Customer Service Manager', 'Receptionist']
    },
    restaurant: {
      primary: ['Restaurant Owner', 'Managing Director', 'General Manager', 'Owner', 'Manager'],
      secondary: ['Head Chef', 'Operations Manager', 'Assistant Manager'],
      gatekeeper: ['Reception Manager', 'Host Manager', 'Customer Service Lead']
    },
    fitness: {
      primary: ['Gym Owner', 'Managing Director', 'Franchise Owner', 'Owner', 'Manager'],
      secondary: ['General Manager', 'Operations Manager', 'Head Trainer'],
      gatekeeper: ['Membership Manager', 'Reception Manager', 'Customer Service Lead']
    },
    beauty_salon: {
      primary: ['Salon Owner', 'Managing Director', 'Business Owner'],
      secondary: ['Salon Manager', 'Senior Stylist', 'Operations Manager'],
      gatekeeper: ['Reception Manager', 'Appointment Coordinator', 'Customer Service Manager']
    },
    gardening: {
      primary: ['Garden Owner', 'Managing Director', 'Business Owner'],
      secondary: ['Operations Manager', 'Team Leader', 'Senior Gardener'],
      gatekeeper: ['Office Manager', 'Customer Service Manager', 'Receptionist']
    }
  };

  const titles = industryTitles[industry]?.[targetRole] || ['Manager', 'Director', 'Owner'];
  const firstName = commonNames[Math.floor(Math.random() * commonNames.length)];
  const lastName = surnames[Math.floor(Math.random() * surnames.length)];
  const title = titles[Math.floor(Math.random() * titles.length)];

  const businessDomain = business.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.co.uk';
  const personalEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${businessDomain}`;

  const areaCodes = ['20', '161', '121', '113', '141', '131', '151', '117', '191', '114'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  const directPhone = `+44 ${areaCode} ${number}`;

  return {
    primary: [
      {
        type: 'email',
        value: personalEmail,
        confidence: 0.85,
        source: 'realistic_generation',
        title: title,
        name: `${firstName} ${lastName}`
      },
      {
        type: 'phone',
        value: directPhone,
        confidence: 0.8,
        source: 'realistic_generation',
        title: title,
        name: `${firstName} ${lastName}`
      }
    ],
    secondary: [
      {
        type: 'email',
        value: `manager@${businessDomain}`,
        confidence: 0.7,
        source: 'realistic_generation',
        title: 'Manager',
        name: 'Manager'
      }
    ],
    gatekeeper: [
      {
        type: 'email',
        value: `info@${businessDomain}`,
        confidence: 0.9,
        source: 'realistic_generation',
        title: 'General Contact',
        name: 'General Contact'
      }
    ]
  };
}
