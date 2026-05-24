#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

async function findLatestDeck(outputDir) {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(d => path.join(outputDir, d.name));
    if (dirs.length === 0) return null;

    let latest = null;
    let latestMtime = 0;
    for (const d of dirs) {
      try {
        const st = await fs.stat(d);
        const m = st.mtimeMs || st.ctimeMs || 0;
        if (m > latestMtime) { latestMtime = m; latest = d; }
      } catch {}
    }
    return latest;
  } catch (err) {
    return null;
  }
}

async function main() {
  const cwd = process.cwd();
  const outputDir = path.join(cwd, 'output');

  const latest = await findLatestDeck(outputDir);
  if (!latest) {
    console.error('No generated decks found in the output/ folder. Run the CLI to create a deck first.');
    process.exit(1);
  }

  const revealDir = path.join(latest, 'reveal.js');
  const serveDir = (await exists(revealDir)) ? revealDir : latest;

  const port = 8000;
  const url = `http://localhost:${port}`;

  console.log(`Serving: ${serveDir}`);
  console.log(`Starting local server at ${url}`);

  const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: serveDir, stdio: 'inherit' });

  server.on('error', (err) => {
    console.error('Failed to start local server:', err.message || err);
    process.exit(1);
  });

  server.on('spawn', () => {
    try { spawn('open', [url], { detached: true, stdio: 'ignore' }).unref(); } catch {}
  });

  process.on('SIGINT', () => {
    server.kill('SIGINT');
    process.exit(0);
  });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

main();
