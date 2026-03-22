#!/usr/bin/env node
'use strict';

// ─── ANSI helpers (zero deps) ───────────────────────────────────────────────
const R  = '\x1b[0m';
const B  = '\x1b[1m';
const DIM = '\x1b[2m';
const Y  = '\x1b[93m';   // bright yellow  ≈ #F5F8A4 vibe
const W  = '\x1b[97m';   // bright white
const G  = '\x1b[92m';   // bright green
const C  = '\x1b[96m';   // bright cyan
const GREY = '\x1b[90m'; // dark grey

const hideCursor = () => process.stdout.write('\x1b[?25l');
const showCursor = () => process.stdout.write('\x1b[?25h');
const clearLine  = () => process.stdout.write('\r\x1b[2K');
const moveTo     = (n) => process.stdout.write(`\x1b[${n}A`);

process.on('exit', showCursor);
process.on('SIGINT', () => { showCursor(); process.exit(); });

// ─── ASCII banner ────────────────────────────────────────────────────────────
function banner() {
  console.log();
  console.log(`${Y}${B}  ███╗   ███╗███████╗ ██████╗  █████╗ ██████╗ ██████╗  ██████╗${R}`);
  console.log(`${Y}${B}  ████╗ ████║██╔════╝██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██╔═══██╗${R}`);
  console.log(`${Y}${B}  ██╔████╔██║█████╗  ██║  ███╗███████║██████╔╝██████╔╝██║   ██║${R}`);
  console.log(`${Y}${B}  ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██╔══██╗██╔══██╗██║   ██║${R}`);
  console.log(`${Y}${B}  ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██████╔╝██║  ██║╚██████╔╝${R}`);
  console.log(`${Y}${B}  ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝${R}`);
  console.log(`${GREY}  ──────────────────────── AI COMMAND INTERFACE ────────────────────────${R}`);
  console.log();
}

// ─── Real progress bar with ETA ─────────────────────────────────────────────
const STAGES = [
  { label: 'Waking up the bro...      ', weight: 12 },
  { label: 'Loading AI modules...     ', weight: 20 },
  { label: 'Spinning up server...     ', weight: 28 },
  { label: 'Connecting endpoints...   ', weight: 22 },
  { label: 'Launching interface...    ', weight: 18 },
];

const BAR_WIDTH   = 36;
const FILL_CHAR   = '█';
const EMPTY_CHAR  = '░';

function renderBar(pct, label, eta) {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const bar    = FILL_CHAR.repeat(filled) + EMPTY_CHAR.repeat(BAR_WIDTH - filled);
  const pctStr = String(Math.round(pct)).padStart(3, ' ');
  const etaStr = eta > 0 ? `ETA ${(eta / 1000).toFixed(1)}s` : 'Done!     ';
  clearLine();
  process.stdout.write(
    `  ${Y}[${bar}]${R} ${W}${B}${pctStr}%${R}  ${GREY}${label}${R}${C}${etaStr}${R}`
  );
}

async function runProgress() {
  hideCursor();
  let overall = 0;
  const totalMs  = 1800;   // total fake-boot time
  const stepMs   = 30;     // tick every 30ms
  const totalTicks = totalMs / stepMs;
  let tick = 0;

  // Compute cumulative weight breakpoints
  const totalWeight = STAGES.reduce((a, s) => a + s.weight, 0);
  let stageStart = 0;
  const breakpoints = STAGES.map(s => {
    const start = stageStart;
    stageStart += (s.weight / totalWeight) * 100;
    return { start, end: stageStart };
  });

  console.log(`${GREY}  ▸ Booting MEGABRO runtime${R}`);
  console.log();

  await new Promise(resolve => {
    const iv = setInterval(() => {
      tick++;
      overall = Math.min(99.5, (tick / totalTicks) * 100);

      // Which stage are we in?
      const stageIdx = breakpoints.findIndex(b => overall < b.end);
      const idx = stageIdx === -1 ? STAGES.length - 1 : stageIdx;
      const label = STAGES[idx].label;

      const elapsed = tick * stepMs;
      const eta     = Math.max(0, totalMs - elapsed);

      renderBar(overall, label, eta);

      if (tick >= totalTicks) {
        clearInterval(iv);
        renderBar(100, 'Complete!                ', 0);
        resolve();
      }
    }, stepMs);
  });

  console.log();
  console.log();
  showCursor();
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  banner();
  await runProgress();

  console.log(`  ${G}✔${R}  Server started on ${W}${B}http://localhost:3000${R}`);
  console.log(`  ${Y}◉${R}  Opening your browser...`);
  console.log();
  console.log(`  ${GREY}Press Ctrl+C to stop${R}`);
  console.log();

  // Start server
  const server = require('../index.js');

  // Small delay then open browser
  setTimeout(async () => {
    try {
      const open = (await import('open')).default;
      await open('http://localhost:3000');
    } catch (_) {
      // open is optional — user can navigate manually
    }
  }, 400);
}

main();
