// Test SMS reply webhook locally
import express from 'express';
import { SMSEmailPipeline } from './sms-email-pipeline.js';

const app = express();
app.use(express.urlencoded({ extended: false }));

// Initialize SMS Email Pipeline
const smsEmailPipeline = new SMSEmailPipeline();

// Test endpoint
app.post('/test-sms-reply', async (req, res) => {
  try {
    console.log('📱 Received SMS reply webhook:');
    console.log('📊 Body:', req.body);
    
    const { From, Body } = req.body;
    
    if (!From || !Body) {
      return res.json({
        success: false,
        message: 'Missing From or Body in request'
      });
    }
    
    // Extract email from SMS body
    const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    if (emailMatch) {
      const emailAddress = emailMatch[1];
      console.log('📧 Extracted email:', emailAddress);
      
      const result = await smsEmailPipeline.processEmailResponse(From, emailAddress);
      
      res.json({
        success: true,
        message: 'Email processed successfully',
        result: result
      });
    } else {
      res.json({
        success: false,
        message: 'No email found in SMS body'
      });
    }
    
  } catch (error) {
    console.error('❌ SMS webhook error:', error);
    res.json({
      success: false,
      message: 'SMS webhook processing failed',
      error: error.message
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🧪 Local SMS test server running on port ${PORT}`);
  console.log('📱 Test with: curl -X POST http://localhost:3001/test-sms-reply -d "From=+447491683261&Body=jonahthomaslloydhughes@gmail.com"');
});
