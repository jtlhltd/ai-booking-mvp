import nodemailer from 'nodemailer';

// Send email with simplified booking link
async function sendSimpleEmail() {
  try {
    console.log('🧪 Sending email with SIMPLIFIED booking form...');
    
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
    
    // Create SIMPLIFIED booking link
    const bookingLink = 'https://ai-booking-mvp.onrender.com/booking-simple.html?email=jonahthomaslloydhughes@gmail.com&phone=%2B447491683261&business=Test%20Business&decisionMaker=John%20Smith&industry=business&location=UK';
    
    // Email content
    const mailOptions = {
      from: emailUser,
      to: 'jonahthomaslloydhughes@gmail.com',
      subject: 'Demo Booking Link - SIMPLIFIED FORM',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🎯 Demo Booking - SIMPLIFIED!</h2>
          
          <p>Hi John Smith,</p>
          
          <p>Thank you for your interest! This is the SIMPLIFIED booking form with ONLY:</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">📝 SIMPLIFIED FORM</h3>
            <ul style="color: #047857;">
              <li>✅ Business Name (pre-filled)</li>
              <li>✅ Your Name (pre-filled)</li>
              <li>✅ Time Slots (to select)</li>
              <li>❌ NO email field</li>
              <li>❌ NO phone field</li>
              <li>❌ NO industry field</li>
              <li>❌ NO location field</li>
            </ul>
          </div>
          
          <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #065f46; margin-top: 0;">📅 Book Your Demo</h3>
            <p>Click the button below to access the SIMPLIFIED booking form:</p>
            <a href="${bookingLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Book Demo - SIMPLIFIED</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            This form only asks for Business Name and Your Name - everything else is pre-filled!
          </p>
        </div>
      `
    };
    
    console.log('📧 Sending SIMPLIFIED booking email...');
    console.log('📧 To: jonahthomaslloydhughes@gmail.com');
    console.log('📧 Subject: Demo Booking Link - SIMPLIFIED FORM');
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ SIMPLIFIED email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
    console.log('\n🎯 SIMPLIFIED BOOKING LINK:');
    console.log(bookingLink);
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
  }
}

sendSimpleEmail();
