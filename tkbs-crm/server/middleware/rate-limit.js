const rateLimit = require('express-rate-limit');

// Auth routes: blunt brute-force defense.
// In dev we relax the ceiling to 100/15min so manual testing + reloads aren't
// painful; tighten back via env var or hardcode in production.
// Internal-only tool used by Joe + Josh; brute-force isn't the threat model.
// 100 attempts / 15 min is plenty.
const MAX = 100;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Too many login attempts. Try again in 15 minutes.` },
});

module.exports = { authLimiter };
