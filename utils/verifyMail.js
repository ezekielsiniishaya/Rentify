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

// Send verification email
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

export default sendVerificationEmail;
