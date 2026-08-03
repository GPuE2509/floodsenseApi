const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(email, otp) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email config is not set in .env. Please set EMAIL_USER and EMAIL_PASS.');
  }

  const mailOptions = {
    from: `FloodSense <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'FloodSense Registration Verification Code',
    text: `Your OTP code is: ${otp}. Code is valid for 2 minutes.`,
    html: `<p>Hello,</p><p>Your registration verification code is: <strong>${otp}</strong></p><p>Code is valid for 2 minutes.</p><p>If you did not request this, please ignore this email.</p>`,
  };

  return transporter.sendMail(mailOptions);
}

async function sendPasswordResetEmail(email, otp) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email config is not set in .env. Please set EMAIL_USER and EMAIL_PASS.');
  }

  const mailOptions = {
    from: `FloodSense <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'FloodSense Password Recovery Verification Code',
    text: `Your password recovery OTP code is: ${otp}. Code is valid for 5 minutes.`,
    html: `<p>Hello,</p><p>Your password recovery verification code is: <strong>${otp}</strong></p><p>Code is valid for 5 minutes.</p><p>If you did not request this, please secure your account.</p>`,
  };

  return transporter.sendMail(mailOptions);
}

async function sendPasswordChangeNotificationEmail(email, full_name) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email config is not set in .env. Please set EMAIL_USER and EMAIL_PASS.');
  }

  const mailOptions = {
    from: `FloodSense <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'FloodSense Account Password Change Notification',
    text: `Hello ${full_name},\n\nThe password of your FloodSense account has just been changed successfully.\n\nIf you did not do this, please contact us immediately for account security assistance.\n\nBest regards,\nFloodSense Team.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #06b6d4; text-align: center;">Password Changed Successfully</h2>
        <p>Hello <strong>${full_name}</strong>,</p>
        <p>We are notifying you that the password for the FloodSense account associated with your email <strong>${email}</strong> was successfully changed at <strong>${new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}</strong>.</p>
        <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; color: #78350f;">
          <strong>SECURITY WARNING:</strong> If you did not request this password change, your account may have been accessed unauthorizedly. Please contact administration or use the "Forgot Password" feature immediately to recover your account.
        </p>
        <p>This email is sent automatically to ensure the security of your account.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 0.8rem; color: #888; text-align: center;">Best regards,<br/>FloodSense Operations Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

async function sendGoogleLoginWelcomeEmail(email, fullName, tempPassword) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email config is not set in .env. Please set EMAIL_USER and EMAIL_PASS.');
  }

  const mailOptions = {
    from: `FloodSense <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to FloodSense - Your Temporary Password',
    text: `Hello ${fullName},\n\nWelcome to FloodSense! You have logged in successfully via Google.\n\nSince this is your first time logging in, we have generated a temporary password for your account so you can log in using email and password in the future:\nTemporary Password: ${tempPassword}\n\nPlease change this password after logging in for security.\n\nBest regards,\nFloodSense Team.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #06b6d4; text-align: center;">Welcome to FloodSense!</h2>
        <p>Hello <strong>${fullName}</strong>,</p>
        <p>You have successfully registered and logged into FloodSense via Google.</p>
        <p>We have generated a temporary password for you. You can use this password along with your email address to log in directly without Google in the future:</p>
        <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; text-align: center; margin: 20px 0;">
          <span style="font-size: 1.1rem; color: #1f2937; letter-spacing: 2px;">Temporary Password:</span>
          <br/>
          <strong style="font-size: 1.6rem; color: #06b6d4; display: block; margin-top: 8px;">${tempPassword}</strong>
        </div>
        <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; color: #78350f; font-size: 0.9rem;">
          <strong>Security Tip:</strong> We recommend changing this temporary password in your profile settings as soon as possible.
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 0.8rem; color: #888; text-align: center;">Best regards,<br/>FloodSense Operations Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangeNotificationEmail,
  sendGoogleLoginWelcomeEmail,
};
