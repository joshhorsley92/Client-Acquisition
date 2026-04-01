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

  // Serve client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
  }

  return app;
}

// Start server if run directly
if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`TKBS CRM server running on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
