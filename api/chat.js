// Chat endpoint: browser -> this function -> Dialogflow (detectIntent) -> reply.
// Needs one Vercel Environment Variable: GOOGLE_CREDENTIALS = the full service-account JSON key.
const dialogflow = require('@google-cloud/dialogflow');

let client, projectId;
function getClient() {
  if (!client) {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    projectId = creds.project_id;
    client = new dialogflow.SessionsClient({
      projectId,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
  }
  return client;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ reply: 'Use POST.' });
  }
  try {
    const { text, sessionId } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.json({ reply: 'Please type a question.' });
    }
    const c = getClient();
    const session = c.projectAgentSessionPath(projectId, String(sessionId || 'web-user').slice(0, 36));
    const [response] = await c.detectIntent({
      session,
      queryInput: { text: { text: String(text).slice(0, 256), languageCode: 'en' } },
    });
    const reply = response.queryResult.fulfillmentText || "Sorry, I didn't get that. Try: Weather in Delhi";
    return res.json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ reply: 'Server error: ' + (err.message || 'unknown') });
  }
};
