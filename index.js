'use strict';

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', (req, res) => {
  const { message, apiKey, history = [], model = 'gemini-2.0-flash' } = req.body;
  if (!message || !apiKey) {
    return res.status(400).json({ error: 'message and apiKey are required' });
  }

  // Gemini rejects consecutive same roles — sanitise
  const safeHistory = [];
  let lastRole = null;
  for (const turn of history) {
    if (turn.role !== lastRole) { safeHistory.push(turn); lastRole = turn.role; }
  }

  const payload = JSON.stringify({
    contents: [...safeHistory, { role: 'user', parts: [{ text: message }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) return res.status(400).json({ error: parsed.error.message });
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
        res.json({ reply: text });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Gemini response' });
      }
    });
  });

  apiReq.on('error', err => res.status(500).json({ error: err.message }));
  apiReq.write(payload);
  apiReq.end();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
app.listen(PORT);
module.exports = app;
