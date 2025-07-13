// utils/emailService.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const sendVerificationEmail = async (to, token, role) => {
  let link = "";
  if (role === "landlord") {
    link = `https://rentify-backend-production-f85a.up.railway.app/api/landlords/verify-email?token=${token}`;
  } else if (role === "tenant") {
    link = `https://rentify-backend-production-f85a.up.railway.app/api/tenants/verify-email?token=${token}`;
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
