const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEV_SERVER_URL = process.env.START_POS_DEV_SERVER_URL || 'http://127.0.0.1:8080';
const LOCAL_HOST = '127.0.0.1';
const LOCAL_PORT = 41731;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

let localServer = null;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function buildDesktopLaunchUrl() {
  return `http://${LOCAL_HOST}:${LOCAL_PORT}/#/dashboard`;
}

function resolveRequestPath(urlPath) {
  const normalized = decodeURIComponent((urlPath || '/').split('?')[0]).replace(/\\/g, '/');
  if (normalized === '/' || normalized.startsWith('/#')) {
    return path.join(DIST_DIR, 'index.html');
  }

  const safeSegments = normalized
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== '.' && segment !== '..');
  const candidate = path.join(DIST_DIR, ...safeSegments);

  if (!candidate.startsWith(DIST_DIR)) {
    return path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  return path.join(DIST_DIR, 'index.html');
}

function createLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveRequestPath(request.url || '/');

      fs.readFile(filePath, (error, contents) => {
        if (error) {
          response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Desktop bundle unavailable.');
          return;
        }

        const extname = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
          'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
          'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
        });
        response.end(contents);
      });
    });

    server.on('error', (error) => {
      reject(error);
    });

    server.listen(LOCAL_PORT, LOCAL_HOST, () => {
      localServer = server;
      resolve(server);
    });
  });
}

async function ensureLocalServer() {
  if (localServer && localServer.listening) {
    return localServer;
  }

  return createLocalServer();
}

async function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: PRELOAD_PATH,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_START_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL);
    return;
  }

  if (!app.isPackaged) {
    await mainWindow.loadURL(DEV_SERVER_URL);
    return;
  }

  await ensureLocalServer();
  await mainWindow.loadURL(buildDesktopLaunchUrl());
}

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}).catch((error) => {
  console.error('Unable to start desktop app:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
