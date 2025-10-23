// Test Google Sheets connection
import { readSheet, ensureLogisticsHeader } from './sheets.js';

const testSheetsConnection = async () => {
  try {
    console.log('🧪 Testing Google Sheets connection...');
    
    const spreadsheetId = '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';
    
    // Test 1: Ensure headers exist
    console.log('📋 Ensuring headers exist...');
    await ensureLogisticsHeader(spreadsheetId);
    console.log('✅ Headers ensured');
    
    // Test 2: Read the sheet
    console.log('📖 Reading sheet data...');
    const result = await readSheet(spreadsheetId, 'Sheet1!A1:U5');
    console.log('✅ Sheet read successfully:', result);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

testSheetsConnection();

