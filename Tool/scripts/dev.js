#!/usr/bin/env node
/*
  Lightweight dev runner: starts backend, then frontend.
  - No external deps (works without concurrently)
  - Waits for server ready before launching React
  - Handles Ctrl+C to stop both
*/

const { spawn } = require('child_process');

const BACKEND_READY_REGEX = /Server is running on http:\/\/localhost:(\d+)/i;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    ...options,
  });
  return child;
}

let serverProc = null;
let clientProc = null;

function gracefulExit(code) {
  if (clientProc && !clientProc.killed) {
    try { clientProc.kill(); } catch {}
  }
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill(); } catch {}
  }
  process.exit(code || 0);
}

process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));

// Start backend first
serverProc = run('npm', ['run', 'server']);

serverProc.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);

  if (/EADDRINUSE|already in use/i.test(text)) {
    console.error('\n[dev] Backend port is in use. Free the port in .env (PORT) and retry.');
  }

  const match = text.match(BACKEND_READY_REGEX);
  if (match && !clientProc) {
    const port = match[1];
    console.log(`[dev] Backend ready on port ${port}. Starting React app...`);
    clientProc = run('npm', ['start'], { stdio: ['inherit', 'inherit', 'inherit'] });
    clientProc.on('exit', (code) => {
      console.log(`[dev] React exited with code ${code}`);
      // Keep backend running; exit only if backend exits.
    });
  }
});

serverProc.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

serverProc.on('exit', (code) => {
  console.log(`[dev] Backend exited with code ${code}`);
  gracefulExit(code);
});

