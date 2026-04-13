const rateLimit = require('express-rate-limit');

// Auth routes: 5 attempts per 15 minutes per IP.
// Successful logins still count — this is a blunt brute-force defense.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

module.exports = { authLimiter };
