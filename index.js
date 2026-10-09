'use strict';

const express = require('express');
const path = require('path');
const https = require('https');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const DISPLAY = process.env.MEGABRO_DISPLAY || ':1';
const MAX_STEPS = 25;
const DEFAULT_MODEL = 'gemini-3.5-flash';
const CFG_DIR = path.join(os.homedir(), '.megabro');
const CFG = path.join(CFG_DIR, 'config.json');

const readCfg = () => {
  try {
    return JSON.parse(fs.readFileSync(CFG, 'utf8'));
  } catch {
    return {};
  }
};

const envKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';

const getKey = () => envKey() || readCfg().apiKey || '';

const MODEL_RE = /^gemini-[a-z0-9][a-z0-9.-]{1,60}$/;

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');

  if (
    origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  next();
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/logo.png', (_req, res) =>
  res.sendFile(path.join(__dirname, 'logo.png'))
);

const checkPort = (port, timeoutMs = 1000) =>
  new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);

    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });

    s.once('error', () => resolve(false));

    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });

    s.connect(port, '127.0.0.1');
  });

function geminiRequest(model, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-goog-api-key': apiKey
      },
      timeout: 60000
    }, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            json: JSON.parse(data)
          });
        } catch {
          resolve({
            status: res.statusCode,
            json: {
              error: {
                message: `Unexpected response (${res.statusCode})`
              }
            }
          });
        }
      });
    });

    req.on('timeout', () =>
      req.destroy(new Error('Request timed out'))
    );

    req.on('error', reject);
    req.end(payload);
  });
}

async function withRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const result = await fn();

      if (
        (result.status === 429 || result.status === 503) &&
        i < tries - 1
      ) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * 2 ** i)
        );
        continue;
      }

      return result;
    } catch (err) {
      if (i >= tries - 1) throw err;

      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
}

function getGeminiError(status, json, selected) {
  const code = json.error?.code || status;
  const message = json.error?.message || 'Unknown Gemini error';

  if (
    code === 429 ||
    json.error?.status === 'RESOURCE_EXHAUSTED'
  ) {
    return {
      status: 429,
      body: { error: message, errorType: 'QUOTA_EXCEEDED' }
    };
  }

  if (code === 404) {
    return {
      status: 404,
      body: {
        error: `Model "${selected}" is unavailable. Choose another model.`,
        errorType: 'MODEL_GONE'
      }
    };
  }

  if ([400, 401, 403].includes(code)) {
    return {
      status: code,
      body: { error: message, errorType: 'AUTH_OR_REQUEST' }
    };
  }

  return {
    status: code >= 400 && code < 600 ? code : 502,
    body: {
      error: message,
      errorType: json.error?.status || 'UPSTREAM'
    }
  };
}

// Chat API
app.post('/api/chat', async (req, res) => {
  const { message, history, model } = req.body || {};
  const apiKey = getKey();

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      error: 'Message is required.'
    });
  }

  if (!apiKey.trim()) {
    return res.status(401).json({
      error: 'Add your Gemini API key to start chatting.',
      errorType: 'NO_KEY'
    });
  }

  const selected =
    typeof model === 'string' && MODEL_RE.test(model)
      ? model
      : DEFAULT_MODEL;

  const turns = [];

  for (const t of Array.isArray(history) ? history.slice(-40) : []) {
    const text = t?.parts?.[0]?.text;

    if (
      !t ||
      !['user', 'model'].includes(t.role) ||
      typeof text !== 'string'
    ) {
      continue;
    }

    if (
      turns.length
        ? turns[turns.length - 1].role === t.role
        : t.role !== 'user'
    ) {
      continue;
    }

    turns.push({
      role: t.role,
      parts: [{ text }]
    });
  }

  if (turns.length && turns[turns.length - 1].role === 'user') {
    turns.pop();
  }

  const payload = JSON.stringify({
    contents: [
      ...turns,
      { role: 'user', parts: [{ text: message }] }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 4096
    }
  });

  try {
    const { status, json } = await withRetry(() =>
      geminiRequest(selected, apiKey.trim(), payload)
    );

    if (json.error) {
      const result = getGeminiError(status, json, selected);
      return res.status(result.status).json(result.body);
    }

    const candidate = json.candidates?.[0];
    const reply = (candidate?.content?.parts || [])
      .map(part => part.text || '')
      .join('')
      .trim();

    if (!reply) {
      const reason =
        json.promptFeedback?.blockReason ||
        candidate?.finishReason ||
        'empty response';

      return res.status(422).json({
        error: `No reply from Gemini (${reason}).`,
        errorType: 'EMPTY'
      });
    }

    res.json({ reply, model: selected });
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({
        error: err.message || 'Could not reach Gemini.',
        errorType: 'NETWORK_ERROR'
      });
    }
  }
});

// Configuration status
app.get('/api/config', (_req, res) => {
  const savedKey = readCfg().apiKey;

  res.json({
    hasKey: !!getKey(),
    source: envKey() ? 'env' : savedKey ? 'saved' : null
  });
});

// Save any non-empty API key, without checking its prefix or format.
app.post('/api/key', (req, res) => {
  const key =
    typeof req.body?.apiKey === 'string'
      ? req.body.apiKey.trim()
      : '';

  if (!key) {
    return res.status(400).json({
      error: 'API key cannot be empty.'
    });
  }

  try {
    fs.mkdirSync(CFG_DIR, {
      recursive: true,
      mode: 0o700
    });

    fs.writeFileSync(
      CFG,
      JSON.stringify({ apiKey: key }),
      { mode: 0o600 }
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({
      error: 'Could not save the key.'
    });
  }
});

// Remove saved API key
app.delete('/api/key', (_req, res) => {
  try {
    fs.unlinkSync(CFG);
  } catch {}

  res.json({ ok: true });
});

// Live Gemini model list
app.get('/api/models', (_req, res) => {
  const key = getKey();

  if (!key.trim()) {
    return res.json({ models: [] });
  }

  const request = https.get({
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models?pageSize=200',
    headers: { 'x-goog-api-key': key.trim() },
    timeout: 10000
  }, upstream => {
    let data = '';

    upstream.on('data', chunk => {
      data += chunk;
    });

    upstream.on('end', () => {
      try {
        const list = (JSON.parse(data).models || [])
          .filter(model =>
            (model.supportedGenerationMethods || [])
              .includes('generateContent')
          )
          .map(model => ({
            id: model.name.replace('models/', ''),
            name: model.displayName || model.name
          }))
          .filter(model =>
            /^gemini-/.test(model.id) &&
            !/embed|image|tts|audio|live|robotics|vision|exp|computer/i
              .test(model.id)
          );

        res.json({ models: list });
      } catch {
        res.json({ models: [] });
      }
    });
  });

  request.on('timeout', () => request.destroy());

  request.on('error', () => {
    if (!res.headersSent) res.json({ models: [] });
  });
});

// Computer-use agent
const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const X = (cmd, args, timeout = 10000) =>
  new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout,
        env: { ...process.env, DISPLAY }
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim()));
        } else {
          resolve(stdout);
        }
      }
    );
  });

async function shot() {
  const file = path.join(
    os.tmpdir(),
    `megabro_${process.pid}_${Date.now()}.png`
  );

  try {
    await X('scrot', ['-o', '-q', '70', file], 8000);
    return fs.readFileSync(file).toString('base64');
  } finally {
    fs.unlink(file, () => {});
  }
}

async function screenSize() {
  const [width, height] = (
    await X('xdotool', ['getdisplaygeometry'])
  ).trim().split(/\s+/).map(Number);

  if (!width || !height) {
    throw new Error('No display');
  }

  return { w: width, h: height };
}

const px = (value, max) =>
  Math.max(
    0,
    Math.min(max - 1, Math.round(Number(value) / 1000 * max))
  );

function openBrowser(url) {
  return new Promise((resolve, reject) => {
    const browsers = [
      'chromium',
      'chromium-browser',
      'google-chrome',
      'firefox'
    ];

    const next = index => {
      if (index >= browsers.length) {
        return reject(
          new Error('No browser found. Install chromium.')
        );
      }

      const browser = browsers[index];
      const args = browser === 'firefox'
        ? [url]
        : ['--no-sandbox', '--new-window', url];

      const process = spawn(browser, args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DISPLAY }
      });

      process.once('error', () => next(index + 1));

      process.once('spawn', () => {
        process.unref();
        resolve();
      });
    };

    next(0);
  });
}

async function act(action, { w, h }) {
  const type = action.action;

  if (
    ['click', 'double_click', 'right_click', 'move', 'scroll']
      .includes(type) &&
    action.x != null &&
    action.y != null
  ) {
    const x = px(action.x, w);
    const y = px(action.y, h);
    const args = ['mousemove', String(x), String(y)];

    if (type === 'click') {
      args.push('click', '1');
    } else if (type === 'double_click') {
      args.push('click', '--repeat', '2', '--delay', '90', '1');
    } else if (type === 'right_click') {
      args.push('click', '3');
    }

    await X('xdotool', args);

    if (type !== 'scroll') {
      return `${type.replace('_', ' ')} at ${x},${y}`;
    }
  }

  if (type === 'type') {
    const value = String(action.text || '').slice(0, 500);

    await X(
      'xdotool',
      ['type', '--delay', '25', '--', value],
      30000
    );

    return `type "${value.slice(0, 40)}"`;
  }

  if (type === 'key') {
    const key = String(action.key || '');

    if (!/^[A-Za-z0-9_+\-]{1,40}$/.test(key)) {
      throw new Error('Bad key');
    }

    await X('xdotool', ['key', key]);
    return `press ${key}`;
  }

  if (type === 'scroll') {
    const amount = Math.min(
      10,
      Math.max(1, parseInt(action.amount, 10) || 3)
    );

    await X('xdotool', [
      'click',
      '--repeat',
      String(amount),
      '--delay',
      '40',
      action.direction === 'up' ? '4' : '5'
    ]);

    return `scroll ${action.direction === 'up' ? 'up' : 'down'}`;
  }

  if (type === 'open_url') {
    const url = new URL(String(action.url));

    if (!/^https?:$/.test(url.protocol)) {
      throw new Error('Bad URL');
    }

    await openBrowser(url.href);
    await sleep(2500);

    return `open ${url.href}`;
  }

  if (type === 'wait') {
    await sleep(2000);
    return 'wait';
  }

  if (
    ['click', 'double_click', 'right_click', 'move'].includes(type)
  ) {
    throw new Error('Missing x/y');
  }

  throw new Error(`Unknown action ${type}`);
}

const AGENT_SYSTEM = `You control a Linux desktop by looking at screenshots.
Each turn you get the goal, the actions taken so far, and the current screenshot.
Reply with ONE JSON object and nothing else:
{"thought":"short reason","action":"click|double_click|right_click|move|type|key|scroll|open_url|wait|done|fail"}
Fields: click/double_click/right_click/move/scroll use x and y on a 0-1000 grid.
type uses text. key uses an xdotool key name.
scroll uses direction up or down and optional amount 1-10.
open_url uses an http or https URL.
done and fail use summary.
Rules: one action per turn. Never enter passwords, payment details or personal data. Never make purchases or delete things. Finish with done as soon as the goal is met.`;

app.post('/api/agent', async (req, res) => {
  const { goal, model, shots } = req.body || {};
  const apiKey = getKey();

  if (typeof goal !== 'string' || !goal.trim()) {
    return res.status(400).json({
      error: 'Tell me what to do.'
    });
  }

  if (!apiKey.trim()) {
    return res.status(401).json({
      error: 'Add your Gemini API key to start.',
      errorType: 'NO_KEY'
    });
  }

  const selected =
    typeof model === 'string' && MODEL_RE.test(model)
      ? model
      : DEFAULT_MODEL;

  res.setHeader(
    'Content-Type',
    'application/x-ndjson; charset=utf-8'
  );
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const send = value => {
    if (!closed) {
      res.write(JSON.stringify(value) + '\n');
    }
  };

  const fail = (error, errorType) =>
    send({ type: 'error', error, errorType });

  let size;

  try {
    size = await screenSize();
    await shot();
  } catch {
    fail(
      `Cannot access display ${DISPLAY}. Start VNC and install xdotool and scrot.`,
      'NO_SCREEN'
    );
    return res.end();
  }

  const log = [];
  let finished = false;

  for (
    let step = 1;
    step <= MAX_STEPS && !closed;
    step++
  ) {
    let img;

    try {
      img = await shot();
    } catch {
      fail('Screenshot failed. Is the display running?', 'NO_SCREEN');
      finished = true;
      break;
    }

    if (shots) {
      send({
        type: 'shot',
        image: 'data:image/png;base64,' + img
      });
    }

    const payload = JSON.stringify({
      systemInstruction: {
        parts: [{ text: AGENT_SYSTEM }]
      },
      contents: [{
        role: 'user',
        parts: [
          {
            text: `Goal: ${goal}\nActions so far:\n${
              log.map((item, index) =>
                `${index + 1}. ${item}`
              ).join('\n') || '(none)'
            }\nGive the next action.`
          },
          {
            inline_data: {
              mime_type: 'image/png',
              data: img
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600,
        responseMimeType: 'application/json'
      }
    });

    let action = null;

    for (
      let attempt = 0;
      attempt < 2 && !action && !closed;
      attempt++
    ) {
      let result;

      try {
        result = await withRetry(() =>
          geminiRequest(selected, apiKey.trim(), payload)
        );
      } catch (err) {
        fail(err.message || 'Could not reach Gemini.', 'NETWORK_ERROR');
        finished = true;
        break;
      }

      if (result.json.error) {
        const errorResult = getGeminiError(
          result.status,
          result.json,
          selected
        );

        fail(
          errorResult.body.error,
          errorResult.body.errorType
        );

        finished = true;
        break;
      }

      const parts =
        result.json.candidates?.[0]?.content?.parts || [];

      const output = parts.map(part => part.text || '').join('');
      const match = output.match(/\{[\s\S]*\}/);

      try {
        action = match ? JSON.parse(match[0]) : null;
      } catch {
        action = null;
      }

      if (!action || typeof action.action !== 'string') {
        action = null;
      }
    }

    if (finished || closed) break;

    if (!action) {
      fail(
        'The model returned an unreadable action. Try again or switch model.',
        'EMPTY'
      );
      finished = true;
      break;
    }

    send({
      type: 'step',
      step,
      thought: String(action.thought || '').slice(0, 200),
      action: action.action
    });

    if (['done', 'fail'].includes(action.action)) {
      send({
        type: 'done',
        ok: action.action === 'done',
        summary: String(action.summary || action.thought || '')
      });

      finished = true;
      break;
    }

    try {
      const description = await act(action, size);
      log.push(description);

      send({
        type: 'acted',
        desc: description
      });
    } catch (err) {
      log.push(`FAILED ${action.action}: ${err.message}`);

      send({
        type: 'acted',
        desc: `${action.action} failed: ${err.message}`,
        failed: true
      });
    }

    await sleep(900);
  }

  if (!finished && !closed) {
    send({
      type: 'done',
      ok: false,
      summary: `Stopped after ${MAX_STEPS} steps without finishing.`
    });
  }

  res.end();
});

// VNC status
app.get('/api/vnc-status', async (_req, res) => {
  const [v1, v0, novnc] = await Promise.all([
    checkPort(5901),
    checkPort(5900),
    checkPort(8080)
  ]);

  const running = v1 || v0;

  res.json({
    running,
    novncReady: novnc,
    vncUrl: novnc
      ? 'http://localhost:8080/vnc.html?autoconnect=true&resize=scale'
      : null
  });
});

// Restricted xdotool endpoint
app.post('/api/execute', (req, res) => {
  const { command } = req.body || {};

  if (typeof command !== 'string') {
    return res.status(400).json({
      error: 'command is required'
    });
  }

  const parts = command
    .trim()
    .replace(/^DISPLAY=\S+\s+/, '')
    .split(/\s+/);

  if (
    parts[0] !== 'xdotool' ||
    parts.length < 2 ||
    /[;&|`$<>\n]/.test(command)
  ) {
    return res.status(400).json({
      error: 'Only plain xdotool commands are allowed'
    });
  }

  execFile(
    'xdotool',
    parts.slice(1),
    {
      timeout: 10000,
      env: { ...process.env, DISPLAY }
    },
    (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
          stderr
        });
      }

      res.json({ ok: true, stdout, stderr });
    }
  );
});

// Screenshot
app.get('/api/screenshot', (_req, res) => {
  const file = path.join(
    os.tmpdir(),
    `megabro_${process.pid}_${Date.now()}.png`
  );

  execFile(
    'scrot',
    ['-q', '60', file],
    {
      timeout: 8000,
      env: { ...process.env, DISPLAY }
    },
    err => {
      if (err) {
        return res.status(500).json({
          error: 'scrot failed. Is VNC running on display :1?'
        });
      }

      fs.readFile(file, (readError, buffer) => {
        fs.unlink(file, () => {});

        if (readError) {
          return res.status(500).json({
            error: 'Could not read screenshot.'
          });
        }

        res.json({
          image: `data:image/png;base64,${buffer.toString('base64')}`
        });
      });
    }
  );
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: require('./package.json').version,
    uptime: Math.floor(process.uptime())
  });
});

app.use('/api', (_req, res) =>
  res.status(404).json({ error: 'Endpoint not found' })
);

function start() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => resolve(server));

    server.once('error', reject);

    const stop = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 3000).unref();
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

module.exports = {
  app,
  start,
  PORT,
  getKey,
  DISPLAY
};

if (require.main === module) {
  start()
    .then(() =>
      console.log(`Megabro running on http://localhost:${PORT}`)
    )
    .catch(err => {
      console.error(
        err.code === 'EADDRINUSE'
          ? `Port ${PORT} is busy. Try PORT=8080 npm start`
          : err.message
      );

      process.exit(1);
    });
}