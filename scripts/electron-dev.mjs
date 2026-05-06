import { spawn } from 'node:child_process';
import net from 'node:net';

const DEV_PORT = 8080;
const DEV_SERVER_URL = `http://127.0.0.1:${DEV_PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const open = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });
    });

    if (open) {
      return;
    }

    await wait(500);
  }

  throw new Error(`Vite dev server unavailable on port ${port}.`);
}

const viteCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const viteProcess = spawn(viteCommand, ['run', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});

let electronProcess = null;

function shutdown(code = 0) {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }
  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

viteProcess.on('exit', (code) => {
  if (code !== 0) {
    shutdown(code ?? 1);
  }
});

try {
  await waitForPort(DEV_PORT);

  electronProcess = spawn(electronCommand, ['electron', '.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_START_URL: DEV_SERVER_URL,
      START_POS_DEV_SERVER_URL: DEV_SERVER_URL,
    },
  });

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0);
  });
}
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
