require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

function createApp(testDb) {
  const app = express();

  // When deployed behind a reverse proxy (tailscale serve, nginx, etc.),
  // trust the proxy's X-Forwarded-Proto header so req.secure reflects the
  // original HTTPS request. Without this, express-session refuses to set
  // Secure cookies and sessions silently fail in production.
  // 'loopback' trusts 127.0.0.1 / ::1 only — safe default for local proxies.
  app.set('trust proxy', 'loopback');

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  const SQLiteStore = require('connect-sqlite3')(session);

  app.use(session({
    store: testDb ? undefined : new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..') }),
    secret: process.env.SESSION_SECRET || 'tkbs-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Make db accessible to routes
  if (testDb) {
    app.use((req, res, next) => { req.db = testDb; next(); });
  } else {
    const db = initDb();
    app.use((req, res, next) => { req.db = db; next(); });
  }

  // Audit middleware — must come after db middleware so req.audit() can write
  const { auditMiddleware } = require('./middleware/audit');
  app.use(auditMiddleware);

  // Rate limiting on auth routes (brute-force defense). Skip in tests —
  // the in-memory counter would bleed across test cases and cause false 429s.
  if (!testDb) {
    const { authLimiter } = require('./middleware/rate-limit');
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/verify-totp', authLimiter);
  }

  // Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/companies', require('./routes/companies'));
  app.use('/api/contacts', require('./routes/contacts'));
  app.use('/api/deals', require('./routes/deals'));
  app.use('/api/activities', require('./routes/activities'));
  app.use('/api/tasks', require('./routes/tasks'));
  app.use('/api/scripts', require('./routes/scripts'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/integrations', require('./routes/integrations'));
  app.use('/api/email', require('./routes/email'));
  app.use('/api/slack', require('./routes/slack'));
  app.use('/api/calendar', require('./routes/calendar'));
  app.use('/api/webhooks', require('./routes/webhooks'));
  app.use('/api/sms', require('./routes/sms'));
  app.use('/api/intake', require('./routes/intake'));
  app.use('/api/import', require('./routes/import'));
  app.use('/api/calls', require('./routes/calls'));
  app.use('/api/search', require('./routes/search'));

  // Serve client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
    // SPA fallback — use RegExp to sidestep Express 5's path-to-regexp v8
    // rejection of the bare `*` wildcard. Any GET that didn't match an /api/*
    // route above falls through to index.html so React Router handles it.
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
  }

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

// Start server if run directly
if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`TKBS CRM server running on http://localhost:${PORT}`);
  });

  // Start Gmail sync polling (every 5 minutes)
  setInterval(async () => {
    try {
      const { syncInboundEmails } = require('./services/email-sync');
      const { getDb } = require('./db');
      const db = getDb();
      const result = await syncInboundEmails(db);
      if (result.synced > 0) {
        console.log(`Gmail sync: ${result.synced} new emails imported, ${result.skipped} skipped`);
      }
    } catch (err) {
      // Silent fail — sync is best effort
    }
  }, 5 * 60 * 1000); // 5 minutes

  console.log('Gmail auto-sync enabled (every 5 minutes)');
}

module.exports = { createApp };
