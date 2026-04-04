const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { createEvent } = require('../services/calendar');

router.use(requireAuth);

// Create calendar event for a deal
router.post('/events', async (req, res) => {
  const { deal_id, summary, description, start_time, end_time, attendee_email } = req.body;
  if (!summary || !start_time) {
    return res.status(400).json({ error: 'summary and start_time are required' });
  }

  try {
    const event = await createEvent(req.db, {
      summary,
      description: description || '',
      startTime: start_time,
      endTime: end_time,
      attendeeEmail: attendee_email,
    });

    // Log activity if deal_id provided
    if (deal_id) {
      req.db.prepare(
        "INSERT INTO activities (deal_id, type, content, metadata, created_by) VALUES (?, 'meeting', ?, ?, ?)"
      ).run(deal_id, `Calendar event created: ${summary}`, JSON.stringify({ event_id: event.id, event_link: event.htmlLink }), req.user.id);
    }

    res.json({ ok: true, event: { id: event.id, link: event.htmlLink } });
  } catch (err) {
    console.error('Calendar event error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
