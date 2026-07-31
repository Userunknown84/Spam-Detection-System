// backend/utils/emailTransporter.js
const nodemailer = require('nodemailer');

// Create transporter using environment variables (Single source of truth)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: process.env.EMAIL_PORT || 587,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Export the ready-to-use transporter
module.exports = transporter;