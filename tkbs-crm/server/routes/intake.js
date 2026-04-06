const router = require('express').Router();
const { executeStageActions } = require('../services/stage-actions');

// Public endpoint — no session auth, uses API key
router.post('/form', (req, res) => {
  // Verify API key
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTAKE_API_KEY;

  if (expectedKey && apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { name, email, phone, company_name, message, source } = req.body;
  if (!name && !company_name) {
    return res.status(400).json({ error: 'name or company_name is required' });
  }

  try {
    // Create company if provided
    let companyId = null;
    if (company_name) {
      // Check for existing company
      const existing = req.db.prepare('SELECT id FROM companies WHERE name = ?').get(company_name);
      if (existing) {
        companyId = existing.id;
      } else {
        const result = req.db.prepare('INSERT INTO companies (name) VALUES (?)').run(company_name);
        companyId = result.lastInsertRowid;
      }
    }

    // Create contact
    let contactId = null;
    if (name || email) {
      // Check for existing contact by email
      let existing = null;
      if (email) {
        existing = req.db.prepare('SELECT id FROM contacts WHERE email = ?').get(email);
      }
      if (existing) {
        contactId = existing.id;
        // Update phone if provided and missing
        if (phone) {
          req.db.prepare('UPDATE contacts SET phone = COALESCE(phone, ?) WHERE id = ?').run(phone, contactId);
        }
      } else {
        const result = req.db.prepare(
          'INSERT INTO contacts (name, email, phone, company_id) VALUES (?, ?, ?, ?)'
        ).run(name || 'Unknown', email || null, phone || null, companyId);
        contactId = result.lastInsertRowid;
      }
    }

    // Create deal
    const dealResult = req.db.prepare(
      `INSERT INTO deals (contact_id, company_id, stage, source, source_detail)
       VALUES (?, ?, 'lead', ?, ?)`
    ).run(contactId, companyId, source || 'web', message || null);
    const dealId = dealResult.lastInsertRowid;

    // Log activity
    req.db.prepare(
      "INSERT INTO activities (deal_id, contact_id, type, content, metadata) VALUES (?, ?, 'system', ?, ?)"
    ).run(dealId, contactId, 'Lead created from web form submission', JSON.stringify({ source: 'web_form', message }));

    // Fire stage actions for 'lead' stage
    executeStageActions(req.db, dealId, 'lead', null);

    res.status(201).json({
      ok: true,
      deal_id: dealId,
      company_id: companyId,
      contact_id: contactId,
    });
  } catch (err) {
    console.error('Form intake error:', err);
    res.status(500).json({ error: 'Failed to process form submission' });
  }
});

module.exports = router;
