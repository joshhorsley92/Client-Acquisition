const { google } = require('googleapis');

function getCalendarClient(db) {
  const settings = db.prepare("SELECT * FROM integration_settings WHERE type = 'google_calendar'").get();
  if (!settings || !settings.enabled) return null;

  const config = JSON.parse(settings.config || '{}');
  if (!config.tokens) return null;

  const { getAuthedClient } = require('./gmail'); // Shares OAuth tokens
  const auth = getAuthedClient(config.tokens);
  return google.calendar({ version: 'v3', auth });
}

async function createEvent(db, { summary, description, startTime, endTime, attendeeEmail, location }) {
  const calendar = getCalendarClient(db);
  if (!calendar) throw new Error('Google Calendar not connected');

  const event = {
    summary,
    description,
    location,
    start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endTime || new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
  return res.data;
}

module.exports = { getCalendarClient, createEvent };
