import nodemailer from 'nodemailer';

// Send email with fresh booking link (cache-busted)
async function sendFreshEmail() {
  try {
    console.log('🧪 Sending email with FRESH booking link...');
    
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
    
    // Create FRESH booking link with cache-busting parameter
    const timestamp = Date.now();
    const bookingLink = `https://ai-booking-mvp.onrender.com/booking-dashboard.html?email=jonahthomaslloydhughes@gmail.com&phone=%2B447491683261&business=Test%20Business&decisionMaker=John%20Smith&industry=business&location=UK&v=${timestamp}`;
    
    // Email content
    const mailOptions = {
      from: emailUser,
      to: 'jonahthomaslloydhughes@gmail.com',
      subject: 'Demo Booking Link - FRESH (Cache-Busted)',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🎯 Demo Booking - FRESH LINK</h2>
          
          <p>Hi John Smith,</p>
          
          <p>This is the ORIGINAL booking dashboard with ONLY the fields you wanted:</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">📝 SIMPLIFIED FORM</h3>
            <ul style="color: #047857;">
              <li>✅ Business Name (pre-filled)</li>
              <li>✅ Your Name (pre-filled)</li>
              <li>✅ Time Slots (to select)</li>
              <li>❌ NO extra fields</li>
            </ul>
          </div>
          
          <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #065f46; margin-top: 0;">📅 Book Your Demo</h3>
            <p>Click the button below to access the booking form:</p>
            <a href="${bookingLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Book Demo - FRESH LINK</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            This link includes a cache-busting parameter to ensure you see the latest version!
          </p>
        </div>
      `
    };
    
    console.log('📧 Sending FRESH booking email...');
    console.log('📧 To: jonahthomaslloydhughes@gmail.com');
    console.log('📧 Subject: Demo Booking Link - FRESH (Cache-Busted)');
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ FRESH email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
    console.log('\n🎯 FRESH BOOKING LINK:');
    console.log(bookingLink);
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
  }
}

sendFreshEmail();
