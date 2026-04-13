const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = req.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    req.audit('login_failed', 'session', null, { email, reason: 'unknown_user' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    req.audit('login_failed', 'session', user.id, { email, reason: 'invalid_password' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // If MFA enabled, require TOTP verification before setting session
  if (user.totp_enabled) {
    req.audit('login_mfa_required', 'session', user.id, { email });
    return res.json({ mfa_required: true, email });
  }

  req.session.userId = user.id;
  const { password_hash, totp_secret, ...safeUser } = user;
  req.audit('login', 'session', user.id, { email });
  res.json({ user: safeUser });
});

router.post('/verify-totp', (req, res) => {
  const { email, password, token } = req.body;
  if (!email || !password || !token) {
    return res.status(400).json({ error: 'Email, password, and code required' });
  }

  const user = req.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.audit('login_failed', 'session', user?.id || null, { email, reason: 'invalid_credentials' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ error: 'MFA not enabled for this account' });
  }

  const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret) });
  const delta = totp.validate({ token: String(token).trim(), window: 1 });

  if (delta === null) {
    req.audit('login_failed', 'session', user.id, { email, reason: 'invalid_totp' });
    return res.status(401).json({ error: 'Invalid verification code' });
  }

  req.session.userId = user.id;
  const { password_hash, totp_secret, ...safeUser } = user;
  req.audit('login', 'session', user.id, { email, mfa: true });
  res.json({ user: safeUser });
});

router.post('/setup-totp', requireAuth, async (req, res) => {
  const secret = new Secret();
  const totp = new TOTP({
    issuer: 'TKBS CRM',
    label: req.user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  // Store the secret provisionally. Not enabled until verify-and-enable succeeds.
  req.db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, req.user.id);

  try {
    const qrCode = await QRCode.toDataURL(totp.toString());
    res.json({ secret: secret.base32, qrCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.post('/enable-totp', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Verification code required' });

  const user = req.db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user?.totp_secret) {
    return res.status(400).json({ error: 'Run setup first' });
  }
  if (user.totp_enabled) {
    return res.status(400).json({ error: 'MFA is already enabled' });
  }

  const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret) });
  const valid = totp.validate({ token: String(token).trim(), window: 1 }) !== null;

  if (!valid) {
    return res.status(400).json({ error: 'Invalid code. Please try again.' });
  }

  req.db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  req.audit('mfa_enabled', 'user', req.user.id, {});
  res.json({ ok: true });
});

router.post('/disable-totp', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Verification code required' });

  const user = req.db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user?.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ error: 'MFA is not enabled' });
  }

  const totp = new TOTP({ secret: Secret.fromBase32(user.totp_secret) });
  const valid = totp.validate({ token: String(token).trim(), window: 1 }) !== null;

  if (!valid) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  req.db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  req.audit('mfa_disabled', 'user', req.user.id, {});
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const userId = req.session?.userId || null;
  const ip = req.ip || req.headers['x-forwarded-for'] || null;
  const db = req.db;

  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    logAudit(db, userId, 'logout', 'session', userId, {}, ip);
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
