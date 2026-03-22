'use strict';

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers for local development
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Chat endpoint: proxy to Gemini API
app.post('/api/chat', (req, res) => {
  const { message, apiKey, history = [], model = 'gemini-2.0-flash' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required and must be a string' });
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  // Validate model name to prevent injection
  const allowedModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-lite'];
  const selectedModel = allowedModels.includes(model) ? model : 'gemini-2.0-flash';

  // Gemini rejects consecutive same-role turns, so sanitise history
  const safeHistory = [];
  let lastRole = null;
  for (const turn of history) {
    if (turn && turn.role && turn.role !== lastRole) {
      safeHistory.push(turn);
      lastRole = turn.role;
    }
  }

  const payload = JSON.stringify({
    contents: [...safeHistory, { role: 'user', parts: [{ text: message }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 30000
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          return res.status(parsed.error.code || 400).json({ error: parsed.error.message });
        }
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
        res.json({ reply: text });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Gemini response' });
      }
    });
  });

  apiReq.on('timeout', () => {
    apiReq.destroy();
    res.status(504).json({ error: 'Request to Gemini API timed out' });
  });

  apiReq.on('error', err => {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  apiReq.write(payload);
  apiReq.end();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: require('./package.json').version,
    uptime: Math.floor(process.uptime())
  });
});

// 404 handler for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, () => {
  // Server ready (logged by CLI)
});

// Graceful shutdown
function shutdown() {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
