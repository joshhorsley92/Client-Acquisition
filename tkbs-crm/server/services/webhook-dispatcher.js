const https = require('https');
const http = require('http');

/**
 * Fires outbound webhooks for a given event.
 * Reads matching webhooks from outbound_webhooks table.
 * Async with best-effort delivery (logs errors, doesn't throw).
 */
async function dispatchWebhooks(db, event, data) {
  const webhooks = db.prepare(
    'SELECT * FROM outbound_webhooks WHERE enabled = 1'
  ).all();

  for (const webhook of webhooks) {
    const events = JSON.parse(webhook.events || '[]');
    if (events.length > 0 && !events.includes(event)) continue;

    const headers = JSON.parse(webhook.headers || '{}');
    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data,
    });

    try {
      await sendWebhook(webhook.url, payload, headers);
    } catch (err) {
      console.error(`Webhook ${webhook.name} failed:`, err.message);
    }
  }
}

function sendWebhook(url, payload, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...customHeaders,
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
    req.write(payload);
    req.end();
  });
}

module.exports = { dispatchWebhooks, sendWebhook };
