const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.use(requireAuth);

// Stage actions
router.get('/actions', (req, res) => {
  const actions = req.db.prepare('SELECT * FROM stage_actions ORDER BY stage, sort_order').all();
  res.json({ actions });
});

router.patch('/actions/:id', requireAdmin, (req, res) => {
  const existing = req.db.prepare('SELECT * FROM stage_actions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Action not found' });

  const updates = [];
  const values = [];

  if (req.body.enabled !== undefined) { updates.push('enabled = ?'); values.push(req.body.enabled ? 1 : 0); }
  if (req.body.config !== undefined) { updates.push('config = ?'); values.push(JSON.stringify(req.body.config)); }

  if (updates.length > 0) {
    values.push(req.params.id);
    req.db.prepare(`UPDATE stage_actions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const action = req.db.prepare('SELECT * FROM stage_actions WHERE id = ?').get(req.params.id);
  res.json({ action });
});

// Users (admin only)
router.get('/users', requireAdmin, (req, res) => {
  const users = req.db.prepare('SELECT id, name, email, role, created_at FROM users').all();
  res.json({ users });
});

router.post('/users', requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const existing = req.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = req.db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, hash, role || 'member');

  const user = req.db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  req.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// CLI status check
router.get('/cli-status', (req, res) => {
  const { isCliAvailable } = require('../services/claude-cli');
  res.json({ available: isCliAvailable() });
});

// Audit log (admin only)
router.get('/audit-log', requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const logs = req.db.prepare(`
    SELECT al.id, al.user_id, al.action, al.resource_type, al.resource_id,
           al.metadata, al.ip_address, al.created_at,
           u.name AS user_name, u.email AS user_email
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = req.db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count;

  res.json({ logs, total, page, limit });
});

module.exports = router;
