const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

function createApp(testDb) {
  const app = express();

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

  // Serve client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
    app.get('*', (req, res) => {
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

  // Sync inbound emails every 5 minutes (dev only; production should use a proper job scheduler)
  if (process.env.NODE_ENV !== 'production') {
    const { syncInboundEmails } = require('./services/email-sync');
    const { getDb } = require('./db');
    setInterval(() => {
      try { syncInboundEmails(getDb()); } catch (e) { console.error('Sync error:', e); }
    }, 5 * 60 * 1000);
  }
}

module.exports = { createApp };
