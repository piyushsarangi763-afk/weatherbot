// Chat endpoint: browser -> this function -> Dialogflow ES (detectIntent) -> reply.
// No packages needed (no package.json). Uses only built-in Node features.
// Needs one Vercel Environment Variable: GOOGLE_CREDENTIALS = the full service-account JSON key.
const crypto = require('crypto');

let cachedToken = null;
let tokenExpiry = 0;

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) return cachedToken;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/dialogflow',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const signature = signer.sign(creds.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = header + '.' + claim + '.' + signature;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Google login failed: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ reply: 'Use POST.' });
  }
  try {
    if (!process.env.GOOGLE_CREDENTIALS) {
      return res.status(500).json({ reply: 'Server error: GOOGLE_CREDENTIALS is not set in Vercel.' });
    }
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 256);
    if (!text) return res.json({ reply: 'Please type a question.' });
    const sessionId = String(body.sessionId || 'web-user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36) || 'web-user';

    const token = await getAccessToken(creds);
    const url = `https://dialogflow.googleapis.com/v2/projects/${creds.project_id}/agent/sessions/${sessionId}:detectIntent`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryInput: { text: { text, languageCode: 'en' } } }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ reply: 'Dialogflow error: ' + (data.error && data.error.message || r.status) });
    }
    const reply = (data.queryResult && data.queryResult.fulfillmentText) ||
      "Sorry, I didn't get that. Try: Weather in Delhi";
    return res.json({ reply });
  } catch (err) {
    return res.status(500).json({ reply: 'Server error: ' + (err.message || 'unknown') });
  }
};
