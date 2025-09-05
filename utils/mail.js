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

  try {
    await transporter.sendMail({
      from: `"Rentify" <${process.env.GMAIL_USER}>`,
      to,
      subject: "Reset Your Rentify Password",
      html: `
        <p>Hi ${name || "there"},</p>
        <p>You requested to reset your password for your Rentify account.</p>
        <p>
          <a href="${resetLink}" 
             target="_blank" 
             style="background:#EC704A; color:#fff; padding:10px 18px; 
                    text-decoration:none; border-radius:4px;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn’t work, copy and paste this link into your browser:</p>
        <p><a href="${resetLink}" target="_blank">${resetLink}</a></p>
        <p>This link will expire in <strong>2 hours</strong>.</p>
        <p>If you did not request this reset, please ignore this email.</p>
        <p>— The Rentify Team</p>
      `,
    });
    console.log(`Password reset email sent to ${to}`);
  } catch (err) {
    console.error("Password reset email error:", err);
    throw err;
  }
};