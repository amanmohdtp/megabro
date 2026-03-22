'use strict';

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Gemini proxy (keeps API key server-side) ─────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, apiKey, history = [] } = req.body;
  if (!message || !apiKey) {
    return res.status(400).json({ error: 'message and apiKey are required' });
  }

  const payload = JSON.stringify({
    contents: [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ reply: text, raw: parsed });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Gemini response' });
      }
    });
  });

  apiReq.on('error', err => res.status(500).json({ error: err.message }));
  apiReq.write(payload);
  apiReq.end();
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.listen(PORT, () => {
  // silence — cli.js already printed the message
});

module.exports = app;
