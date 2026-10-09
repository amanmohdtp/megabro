#!/usr/bin/env node
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFile } = require('child_process');
const pkg = require('../package.json');

// ── flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('-v') || args.includes('--version')) { console.log(pkg.version); process.exit(0); }
if (args.includes('-h') || args.includes('--help')) {
  console.log(`megabro ${pkg.version}\n\nUsage: megabro [options]\n\n  --no-open    don't open the browser\n  -v, --version\n  -h, --help\n\nEnv: PORT, GEMINI_API_KEY, MEGABRO_DISPLAY`);
  process.exit(0);
}

// ── terminal capabilities (phone-safe) ───────────────────────────────────────
const tty = !!process.stdout.isTTY;
const color = tty && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const cols = Math.max(20, Math.min(process.stdout.columns || 40, 60));
const c = code => s => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), yellow = c(33), green = c(32), red = c(31);
const OK = green('✔'), BAD = red('✖'), WARN = yellow('!');
const out = (s = '') => process.stdout.write(s + '\n');
const hideCursor = () => color && process.stdout.write('\x1b[?25l');
const showCursor = () => color && process.stdout.write('\x1b[?25h');
process.on('exit', showCursor);
process.on('SIGINT', () => { showCursor(); process.exit(0); });

// ── banner: 3 lines, 24 columns, fits any phone ──────────────────────────────
function banner() {
  out();
  if (cols >= 26) {
    out(yellow(bold(' ╔╦╗╔═╗╔═╗╔═╗╔╗ ╦═╗╔═╗')));
    out(yellow(bold(' ║║║║╣ ║ ╦╠═╣╠╩╗╠╦╝║ ║')));
    out(yellow(bold(' ╩ ╩╚═╝╚═╝╩ ╩╚═╝╩╚═╚═╝')));
  } else out(' ' + yellow(bold('MEGABRO')));
  out(` v${pkg.version}`);
  out(' ' + '─'.repeat(Math.min(cols - 2, 24)));
}

// ── real checks ──────────────────────────────────────────────────────────────
const has = cmd => (process.env.PATH || '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, cmd)));
const portOpen = port => new Promise(r => {
  const s = new net.Socket(); s.setTimeout(700);
  s.once('connect', () => { s.destroy(); r(true); });
  s.once('error', () => r(false)); s.once('timeout', () => { s.destroy(); r(false); });
  s.connect(port, '127.0.0.1');
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── progress bar (one line, redrawn; skipped when not a TTY) ─────────────────
const BAR = Math.min(20, cols - 14);
function draw(pct, label) {
  if (!color) return;
  const n = Math.round(BAR * pct / 100);
  process.stdout.write(`\r\x1b[2K ${yellow('█'.repeat(n))}${'░'.repeat(BAR - n)} ${String(pct).padStart(3)}% ${label}`.slice(0, cols + 24));
}
const clearBar = () => color && process.stdout.write('\r\x1b[2K');

async function main() {
  banner();
  hideCursor();
  const { start, PORT, getKey, DISPLAY } = require('../index.js');
  const url = `http://localhost:${PORT}`;
  const lines = [];
  const steps = [
    ['Starting server', async () => {
      try { await start(); lines.push(`${OK} Server      :${PORT}`); return true; }
      catch (e) {
        showCursor(); clearBar();
        out(` ${BAD} ${e.code === 'EADDRINUSE' ? `Port ${PORT} is busy.\n   Try: PORT=8080 megabro` : e.message}\n`);
        process.exit(1);
      }
    }],
    ['Checking key', async () => lines.push(getKey() ? `${OK} Gemini key saved` : `${WARN} Gemini key  not set\n   add it in the app (Key)`)],
    ['Checking tools', async () => {
      const need = ['xdotool', 'scrot'], miss = need.filter(t => !has(t));
      const browser = ['chromium', 'chromium-browser', 'google-chrome', 'firefox'].some(has);
      lines.push(miss.length ? `${WARN} Control     missing ${miss.join(', ')}` : `${OK} Control     xdotool, scrot`);
      lines.push(browser ? `${OK} Browser     found` : `${WARN} Browser     install chromium`);
    }],
    ['Checking screen', async () => {
      const [vnc, novnc] = await Promise.all([portOpen(5901), portOpen(8080)]);
      lines.push(vnc && novnc ? `${OK} Screen      ${DISPLAY} live` : `${WARN} Screen      ${vnc ? 'start noVNC (8080)' : 'VNC offline'}`);
    }],
  ];

  for (let i = 0; i < steps.length; i++) {
    draw(Math.round((i / steps.length) * 100), steps[i][0]);
    await steps[i][1]();
    if (color) await sleep(160); // brief, so each stage is readable
  }
  draw(100, 'Ready');
  if (color) await sleep(180);
  clearBar();
  showCursor();

  lines.forEach(l => out(' ' + l));
  out();
  out(` ${bold('▸ ' + url)}`);
  out(' Ctrl+C to stop');
  out();

  if (args.includes('--no-open')) return;
  // Termux has no xdg-open; termux-open-url launches the Android browser.
  if (has('termux-open-url')) return execFile('termux-open-url', [url], () => {});
  try { await (await import('open')).default(url); } catch (_) { /* open it manually */ }
}

main().catch(e => { showCursor(); out(` ${BAD} ${e.message}`); process.exit(1); });
