import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Create Nodemailer transporter with Gmail
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  pool: true,
  maxConnections: 2,
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

// Send password reset email
const sendPasswordResetEmail = async (to, token, name) => {
  const resetLink = `https://rentify-ng.netlify.app/pages/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"Rentify" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Reset Your Rentify Password",
    html: `
      <p>Hi ${name || "there"},</p>
      <p>You requested to reset your password for your Rentify account.</p>
      <p>Please reset your password by clicking the link below:</p>
      <a href="${resetLink}" target="_blank" style="color:#EC704A;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you did not request this reset, please ignore this email.</p>
    `,
  });
};

export default sendPasswordResetEmail;
