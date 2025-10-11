import nodemailer from 'nodemailer';

// Manual email test using your Gmail credentials
async function sendManualEmail() {
  try {
    console.log('🧪 Testing email confirmation system manually...');
    
    // Your Gmail credentials
    const emailUser = 'jonahthomaslloydhughes@gmail.com';
    const emailPass = 'mxoo rbpb lrty cczj'; // Your app password
    
    console.log('📧 Setting up email transporter...');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
    
    console.log('📧 Creating confirmation email...');
    
    // Create booking link with all parameters
    const bookingLink = 'https://ai-booking-mvp.onrender.com/booking-dashboard.html?email=jonahthomaslloydhughes@gmail.com&phone=%2B447491683261&business=Test%20Business&decisionMaker=John%20Smith&industry=business&location=UK';
    
    // Email content
    const mailOptions = {
      from: emailUser,
      to: 'jonahthomaslloydhughes@gmail.com',
      subject: 'Demo Booking Link - AI Booking Solutions',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🎯 Demo Booking Confirmed!</h2>
          
          <p>Hi John Smith,</p>
          
          <p>Thank you for your interest in our AI booking service! We're excited to show you how our system can transform your business operations.</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">📅 Book Your Demo Call</h3>
            <p>Click the button below to schedule your personalized demo:</p>
            <a href="${bookingLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Book Demo Now</a>
          </div>
          
          <div style="background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h4 style="color: #065f46; margin-top: 0;">🎯 What to Expect:</h4>
            <ul style="color: #047857;">
              <li>15-minute personalized demo</li>
              <li>See how AI can handle your bookings</li>
              <li>Discuss your specific business needs</li>
              <li>Get pricing and next steps</li>
            </ul>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            If you have any questions, feel free to reply to this email or call us directly.
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            Best regards,<br>
            The AI Booking Solutions Team
          </p>
        </div>
      `
    };
    
    console.log('📧 Sending confirmation email...');
    console.log('📧 To: jonahthomaslloydhughes@gmail.com');
    console.log('📧 Subject: Demo Booking Link - AI Booking Solutions');
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
    console.log('\n🎯 WHAT TO CHECK:');
    console.log('1. 📧 Check your Gmail inbox');
    console.log('2. 📧 Look for "Demo Booking Link - AI Booking Solutions"');
    console.log('3. 🎯 Click the "Book Demo Now" button');
    console.log('4. 📅 Test the booking dashboard');
    
    console.log('\n📱 BOOKING LINK:');
    console.log(bookingLink);
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    
    if (error.message.includes('Invalid login')) {
      console.log('\n🔧 Gmail authentication issue:');
      console.log('- Check if app password is correct');
      console.log('- Verify 2-factor authentication is enabled');
      console.log('- Try generating a new app password');
    }
  }
}

sendManualEmail();
