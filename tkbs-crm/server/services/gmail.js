const { google } = require('googleapis');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/integrations/google/callback'
  );
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
}

async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function getAuthedClient(tokens) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function sendEmail(tokens, { to, subject, body, from }) {
  const oauth2Client = getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encodedMessage = Buffer.from(message).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return res.data;
}

async function getUserEmail(tokens) {
  const oauth2Client = getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress;
}

async function listNewMessages(tokens, afterTimestamp) {
  const oauth2Client = getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const query = afterTimestamp ? `after:${Math.floor(new Date(afterTimestamp).getTime() / 1000)}` : 'newer_than:1d';

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50,
  });

  if (!list.data.messages) return [];

  const messages = [];
  for (const msg of list.data.messages) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
    const headers = full.data.payload.headers;
    const from = headers.find(h => h.name === 'From')?.value || '';
    const to = headers.find(h => h.name === 'To')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Extract body
    let bodyText = '';
    if (full.data.payload.body?.data) {
      bodyText = Buffer.from(full.data.payload.body.data, 'base64url').toString();
    } else if (full.data.payload.parts) {
      const textPart = full.data.payload.parts.find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        bodyText = Buffer.from(textPart.body.data, 'base64url').toString();
      }
    }

    messages.push({
      id: msg.id,
      threadId: full.data.threadId,
      from, to, subject, date, bodyText,
    });
  }

  return messages;
}

module.exports = { getOAuth2Client, getAuthUrl, getTokensFromCode, getAuthedClient, sendEmail, getUserEmail, listNewMessages };
