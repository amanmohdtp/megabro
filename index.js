'use strict';

const express  = require('express');
const path     = require('path');
const https    = require('https');
const { exec } = require('child_process');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ── Gemini chat proxy ─────────────────────────────────────────────────────────
app.post('/api/chat', (req, res) => {
  const { message, apiKey, history = [], model = 'gemini-2.0-flash' } = req.body;

  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'message is required and must be a string' });
  if (!apiKey || typeof apiKey !== 'string')
    return res.status(400).json({ error: 'apiKey is required' });

  const allowedModels = [
    'gemini-2.0-flash', 'gemini-1.5-flash',
    'gemini-1.5-pro',   'gemini-2.0-flash-lite'
  ];
  const selectedModel = allowedModels.includes(model) ? model : 'gemini-2.0-flash';

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
        if (parsed.error)
          return res.status(parsed.error.code || 400).json({ error: parsed.error.message });
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
        res.json({ reply: text });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Gemini response' });
      }
    });
  });

  apiReq.on('timeout', () => { apiReq.destroy(); res.status(504).json({ error: 'Gemini API timed out' }); });
  apiReq.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
  apiReq.write(payload);
  apiReq.end();
});

// ── VNC status check ──────────────────────────────────────────────────────────
app.get('/api/vnc-status', (_req, res) => {
  exec('pgrep -x Xvnc || pgrep -x tigervnc || pgrep -x vncserver', (err) => {
    const running = !err;
    res.json({ running, vncUrl: running ? `http://localhost:8080/vnc.html?autoconnect=true&resize=scale` : null });
  });
});

// ── Execute xdotool command (computer use) ────────────────────────────────────
app.post('/api/execute', (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string')
    return res.status(400).json({ error: 'command is required' });

  // Only allow xdotool commands for safety
  const safe = command.trim();
  if (!safe.startsWith('xdotool') && !safe.startsWith('DISPLAY='))
    return res.status(400).json({ error: 'Only xdotool commands are allowed' });

  exec(`DISPLAY=:1 ${safe}`, { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr });
    res.json({ ok: true, stdout, stderr });
  });
});

// ── Screenshot (scrot → base64) ───────────────────────────────────────────────
app.get('/api/screenshot', (_req, res) => {
  const tmpFile = `/tmp/megabro_shot_${Date.now()}.png`;
  exec(`DISPLAY=:1 scrot -q 60 ${tmpFile}`, { timeout: 8000 }, (err) => {
    if (err) return res.status(500).json({ error: 'scrot failed — is VNC running?' });
    try {
      const data = fs.readFileSync(tmpFile);
      const b64  = data.toString('base64');
      fs.unlinkSync(tmpFile);
      res.json({ image: `data:image/png;base64,${b64}` });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read screenshot' });
    }
  });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: require('./package.json').version, uptime: Math.floor(process.uptime()) });
});

app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

const server = app.listen(PORT);

function shutdown() { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
