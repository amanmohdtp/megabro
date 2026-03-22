'use strict';

const express  = require('express');
const path     = require('path');
const https    = require('https');
const net      = require('net');
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

// ── Port connectivity check (replaces unreliable pgrep) ───────────────────────
function checkPort(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error',   () => resolve(false));
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

// ── Gemini API call with exponential-backoff retry on 429 ────────────────────
function geminiRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function callGeminiWithRetry(options, payload, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }
    try {
      const { statusCode, body } = await geminiRequest(options, payload);
      const parsed = JSON.parse(body);

      // Only retry on 429 (quota) or 503 (overloaded)
      if ((statusCode === 429 || statusCode === 503) && attempt < maxRetries - 1) {
        lastError = parsed.error;
        continue;
      }
      return { statusCode, parsed };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) continue;
    }
  }
  throw lastError || new Error('All retries exhausted');
}

// ── Gemini chat proxy ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
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

  // Sanitise history: enforce alternating user/model turns
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

  try {
    const { statusCode, parsed } = await callGeminiWithRetry(options, payload);

    if (parsed.error) {
      const code    = parsed.error.code || statusCode;
      const status  = parsed.error.status || '';
      const msg     = parsed.error.message || 'Unknown Gemini error';

      // Surface quota errors with actionable info
      if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
        return res.status(429).json({
          error: msg,
          errorType: 'QUOTA_EXCEEDED',
          hint: 'You have hit the Gemini free-tier quota. Try switching to a lighter model (e.g. Gemini 2.0 Flash Lite), wait a minute, or check your quota at https://aistudio.google.com/'
        });
      }

      if (code === 400 || status === 'INVALID_ARGUMENT') {
        return res.status(400).json({
          error: msg,
          errorType: 'INVALID_REQUEST',
          hint: 'Your API key may be invalid or the request was malformed.'
        });
      }

      return res.status(code || 400).json({ error: msg, errorType: status });
    }

    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
    res.json({ reply: text, model: selectedModel });

  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ error: err.message || 'Failed to reach Gemini API', errorType: 'NETWORK_ERROR' });
  }
});

// ── VNC status check ──────────────────────────────────────────────────────────
// FIX: Use port checks instead of pgrep (pgrep missed "Xtigervnc" on Termux).
// VNC default port: 5901 (display :1)
// noVNC/websockify default port: 8080
app.get('/api/vnc-status', async (_req, res) => {
  try {
    const [vncPort, novncPort] = await Promise.all([
      checkPort(5901),  // TigerVNC / Xvnc raw port
      checkPort(8080),  // websockify / noVNC web client
    ]);

    // Also try alternate VNC ports (5900, 5902) in case display :0 or :2 is used
    const altVnc = vncPort ? true : await checkPort(5900);

    const running     = vncPort || altVnc;
    const novncReady  = novncPort;

    // Build the VNC web URL only when noVNC is actually reachable
    const vncUrl = novncReady
      ? 'http://localhost:8080/vnc.html?autoconnect=true&resize=scale'
      : null;

    res.json({
      running,
      novncReady,
      vncUrl,
      ports: { vnc: vncPort ? 5901 : (altVnc ? 5900 : null), novnc: novncPort ? 8080 : null }
    });
  } catch (err) {
    res.json({ running: false, novncReady: false, vncUrl: null, error: err.message });
  }
});

// ── Execute xdotool command (computer use) ────────────────────────────────────
app.post('/api/execute', (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string')
    return res.status(400).json({ error: 'command is required' });

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
    if (err) return res.status(500).json({ error: 'scrot failed — is VNC running on DISPLAY :1?' });
    try {
      const data = fs.readFileSync(tmpFile);
      const b64  = data.toString('base64');
      fs.unlinkSync(tmpFile);
      res.json({ image: `data:image/png;base64,${b64}` });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read screenshot file' });
    }
  });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: require('./package.json').version,
    uptime: Math.floor(process.uptime())
  });
});

app.use('/api/*', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

const server = app.listen(PORT, () => {
  // Port is ready — exported for bin/cli.js to know it's live
  server.emit('ready');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
