// utils/emailService.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const sendVerificationEmail = async (to, token) => {
  const link = `https://your-frontend-url.com/verify-email.html?token=${token}`;

  await transporter.sendMail({
    from: `"Rentify" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Verify Your Email",
    html: `<p>Click the link to verify your email: <a href="${link}">Verify Email</a></p>`,
  });
};

module.exports = sendVerificationEmail;
