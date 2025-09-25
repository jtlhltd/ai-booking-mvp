#!/usr/bin/env node

/**
 * Client Dashboard Generator
 * 
 * Usage: node create-client-dashboard.js "Client Name" "#FF5733" "#C70039"
 * 
 * This script creates a customized dashboard for each client by:
 * 1. Copying the template
 * 2. Updating branding and colors
 * 3. Generating a ready-to-deploy HTML file
 */

const fs = require('fs');
const path = require('path');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
    console.log(`
🚀 Client Dashboard Generator

Usage: node create-client-dashboard.js "Client Name" [primaryColor] [secondaryColor]

Examples:
  node create-client-dashboard.js "Victory Dental"
  node create-client-dashboard.js "Northside Vet" "#FF5733" "#C70039"
  node create-client-dashboard.js "ABC Company" "#2E8B57" "#32CD32"

The script will create a customized dashboard file ready for deployment.
`);
    process.exit(1);
}

const clientName = args[0];
const primaryColor = args[1] || '#667eea';
const secondaryColor = args[2] || '#764ba2';

// Sanitize client name for filename
const sanitizedName = clientName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

const outputFile = `client-dashboard-${sanitizedName}.html`;

console.log(`\n🚀 Creating dashboard for: ${clientName}`);
console.log(`🎨 Primary color: ${primaryColor}`);
console.log(`🎨 Secondary color: ${secondaryColor}`);
console.log(`📁 Output file: ${outputFile}\n`);

// Read the template
const templatePath = path.join(__dirname, 'public', 'client-dashboard-template.html');

if (!fs.existsSync(templatePath)) {
    console.error('❌ Template file not found:', templatePath);
    process.exit(1);
}

let template = fs.readFileSync(templatePath, 'utf8');

// Replace placeholders
template = template.replace(/Client Company/g, clientName);
template = template.replace(/"#667eea"/g, `"${primaryColor}"`);
template = template.replace(/"#764ba2"/g, `"${secondaryColor}"`);
template = template.replace(/YOUR_API_KEY_HERE/g, 'YOUR_API_KEY_HERE'); // Keep placeholder

// Write the customized file
fs.writeFileSync(outputFile, template);

console.log('✅ Dashboard created successfully!');
console.log('\n📋 Next steps:');
console.log(`1. Open ${outputFile} in a text editor`);
console.log('2. Replace "YOUR_API_KEY_HERE" with the actual API key');
console.log('3. Upload to your web hosting service');
console.log('4. Share the URL with your client');
console.log('\n🎉 Your client now has a personalized dashboard!');

// Also create a simple deployment package
const deploymentPackage = {
    clientName,
    primaryColor,
    secondaryColor,
    outputFile,
    createdAt: new Date().toISOString(),
    instructions: [
        '1. Replace YOUR_API_KEY_HERE with actual API key',
        '2. Upload the HTML file to web hosting',
        '3. Test the dashboard with live data',
        '4. Share URL with client'
    ]
};

fs.writeFileSync(
    `deployment-${sanitizedName}.json`, 
    JSON.stringify(deploymentPackage, null, 2)
);

console.log(`\n📦 Deployment package saved: deployment-${sanitizedName}.json`);
console.log('💡 This contains all the details for easy reference later.\n');
