#!/usr/bin/env node
'use strict';

// ANSI helpers (zero dependencies)
const R  = '\x1b[0m';
const B  = '\x1b[1m';
const DIM = '\x1b[2m';
const Y  = '\x1b[93m';
const W  = '\x1b[97m';
const G  = '\x1b[92m';
const C  = '\x1b[96m';
const GREY = '\x1b[90m';
const RED  = '\x1b[91m';

const hideCursor = () => process.stdout.write('\x1b[?25l');
const showCursor = () => process.stdout.write('\x1b[?25h');
const clearLine  = () => process.stdout.write('\r\x1b[2K');

process.on('exit', showCursor);
process.on('SIGINT', () => { showCursor(); process.exit(); });

// Version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const pkg = require('../package.json');
  console.log(`megabro v${pkg.version}`);
  process.exit(0);
}

// Help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
  ${Y}${B}MEGABRO${R} - AI-powered Gemini interface

  ${W}Usage:${R}
    megabro              Start the server and open browser
    megabro --version    Show version number
    megabro --help       Show this help message

  ${W}Environment:${R}
    PORT                 Set custom port (default: 3000)

  ${W}Examples:${R}
    megabro              Start on default port 3000
    PORT=8080 megabro    Start on port 8080
  `);
  process.exit(0);
}

// ASCII banner
function banner() {
  console.log();
  console.log(`${Y}${B}  ███╗   ███╗███████╗ ██████╗  █████╗ ██████╗ ██████╗  ██████╗${R}`);
  console.log(`${Y}${B}  ████╗ ████║██╔════╝██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██╔═══██╗${R}`);
  console.log(`${Y}${B}  ██╔████╔██║█████╗  ██║  ███╗███████║██████╔╝██████╔╝██║   ██║${R}`);
  console.log(`${Y}${B}  ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██╔══██╗██╔══██╗██║   ██║${R}`);
  console.log(`${Y}${B}  ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██████╔╝██║  ██║╚██████╔╝${R}`);
  console.log(`${Y}${B}  ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝${R}`);
  console.log(`${GREY}  ======================== AI COMMAND INTERFACE ========================${R}`);
  console.log();
}

// Progress bar with ETA
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
  const totalMs  = 1800;
  const stepMs   = 30;
  const totalTicks = totalMs / stepMs;
  let tick = 0;

  const totalWeight = STAGES.reduce((a, s) => a + s.weight, 0);
  let stageStart = 0;
  const breakpoints = STAGES.map(s => {
    const start = stageStart;
    stageStart += (s.weight / totalWeight) * 100;
    return { start, end: stageStart };
  });

  console.log(`${GREY}  > Booting MEGABRO runtime${R}`);
  console.log();

  await new Promise(resolve => {
    const iv = setInterval(() => {
      tick++;
      overall = Math.min(99.5, (tick / totalTicks) * 100);

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

// Main entry point
async function main() {
  banner();
  await runProgress();

  const PORT = process.env.PORT || 3000;

  console.log(`  ${G}✔${R}  Server started on ${W}${B}http://localhost:${PORT}${R}`);
  console.log(`  ${Y}◉${R}  Opening your browser...`);
  console.log();
  console.log(`  ${GREY}Press Ctrl+C to stop${R}`);
  console.log();

  // Start server
  try {
    require('../index.js');
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.log(`  ${RED}✖${R}  Port ${PORT} is already in use.`);
      console.log(`  ${GREY}  Try: PORT=<other_port> megabro${R}`);
      process.exit(1);
    }
    throw err;
  }

  // Small delay then open browser
  setTimeout(async () => {
    try {
      const open = (await import('open')).default;
      await open(`http://localhost:${PORT}`);
    } catch (_) {
      console.log(`  ${GREY}Could not open browser automatically.${R}`);
      console.log(`  ${GREY}Open http://localhost:${PORT} manually.${R}`);
    }
  }, 400);
}

main().catch(err => {
  showCursor();
  console.error(`\n  ${RED}✖ Fatal error:${R}`, err.message);
  process.exit(1);
});
