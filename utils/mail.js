// utils/emailService.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Create Nodemailer transporter with Gmail
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,            // SMTPS
  secure: true,         // SSL/TLS from the start
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS, // Google App Password (not your normal password)
  },
  pool: true,
  maxConnections: 2,
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

//  Send verification email
const sendVerificationEmail = async (to, token, role) => {
  let link = "";
  if (role === "landlord") {
    link = `https://rentify-backend-48sk.onrender.com/api/landlords/verify-email?token=${token}`;
  } else if (role === "tenant") {
    link = `https://rentify-backend-48sk.onrender.com/api/tenants/verify-email?token=${token}`;
  } else {
    throw new Error("Invalid user role for email verification.");
  }

  await transporter.sendMail({
    from: `"Rentify" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Verify Your Email",
    html: `
      <p>Hi there,</p>
      <p>Thank you for registering with Rentify.</p>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${link}" target="_blank" style="color:#EC704A;">Verify Email</a>
      <p>If you did not sign up, you can ignore this email.</p>
    `,
  });
};

// Send password reset email
const sendPasswordResetEmail = async (to, token, name) => {
  const resetLink = `https://rentify-ng.netlify.app/pages/reset-password.html?token=${token}`;

  await transporter.sendMail({
    from: `"Rentify" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Password Reset Request - Rentify",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #EC704A;">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>You have requested to reset your password for your Rentify account.</p>
        <p>Please click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
             target="_blank" 
             style="background-color: #EC704A; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 5px; 
                    display: inline-block;">
            Reset Password
          </a>
        </div>
        <p><strong>This link will expire in 2 hours.</strong></p>
        <p>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
        <p>For security reasons, please do not share this link with anyone.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          If the button above doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetLink}" style="color: #EC704A;">${resetLink}</a>
        </p>
        <p style="color: #666; font-size: 12px;">
          Best regards,<br>
          The Rentify Team
        </p>
      </div>
    `,
  });
};

export { sendVerificationEmail as default, sendPasswordResetEmail };
