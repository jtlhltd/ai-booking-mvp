// create-clean-sheet.js
// Create a clean Google Sheet with correct headers

import * as sheets from './sheets.js';

const SHEET_ID = '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';

async function createCleanSheet() {
  try {
    console.log('🧹 Creating clean sheet with correct headers...\n');
    
    await sheets.ensureLogisticsHeader(SHEET_ID);
    
    console.log('✅ Headers written to sheet!');
    console.log('📋 Go to your Google Sheet and verify row 1 has these headers:');
    console.log('   A: Timestamp');
    console.log('   B: Business Name');
    console.log('   C: Decision Maker');
    console.log('   D: Phone');
    console.log('   E: Email');
    console.log('   F: International (Y/N)');
    console.log('   G: Main Couriers');
    console.log('   H: International Shipments per Week');
    console.log('   I: Main Countries');
    console.log('   J: Example Shipment (weight x dims)');
    console.log('   K: Example Shipment Cost');
    console.log('   L: UK Shipments per Week');
    console.log('   M: UK Courier');
    console.log('   N: Std Rate up to KG');
    console.log('   O: Excl Fuel & VAT?');
    console.log('   P: Single vs Multi-parcel');
    console.log('   Q: Receptionist Name');
    console.log('   R: Callback Needed');
    console.log('   S: Call ID');
    console.log('   T: Recording URL');
    console.log('   U: Transcript Snippet');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createCleanSheet();







