const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEV_SERVER_URL = process.env.START_POS_DEV_SERVER_URL || 'http://127.0.0.1:8080';
const LOCAL_HOST = '127.0.0.1';
const LOCAL_PORT = 41731;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

let localServer = null;
let mainWindowRef = null;

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
  mainWindowRef = mainWindow;

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

async function listDesktopPrinters() {
  const targetWindow = mainWindowRef || BrowserWindow.getAllWindows()[0] || null;
  if (!targetWindow) {
    return [];
  }

  const printers = await targetWindow.webContents.getPrintersAsync();
  return (printers || []).map((printer) => ({
    id: printer.name,
    name: printer.displayName || printer.name,
    isDefault: !!printer.isDefault,
    status: typeof printer.status === 'number' ? printer.status : null,
  }));
}

function buildDesktopPrintDataUrl(html) {
  const base64Html = Buffer.from(String(html), 'utf8').toString('base64');
  return `data:text/html;charset=utf-8;base64,${base64Html}`;
}

function detectPaperWidthMm(html) {
  const source = String(html || '');
  const pageMatch = source.match(/@page\s*\{\s*size:\s*(58|80)mm/i);
  if (pageMatch) {
    return Number(pageMatch[1]);
  }
  const bodyMatch = source.match(/width:\s*(58|80)mm/i);
  if (bodyMatch) {
    return Number(bodyMatch[1]);
  }
  return null;
}

function buildDesktopPrintOptions(printerId, html) {
  const options = {
    silent: true,
    printBackground: true,
    deviceName: printerId,
    margins: {
      marginType: 'none',
    },
  };

  const paperWidthMm = detectPaperWidthMm(html);
  if (paperWidthMm) {
    options.pageSize = {
      width: paperWidthMm * 1000,
      height: 300000,
    };
  }

  return options;
}

function escapePowerShellSingleQuoted(value) {
  return String(value || '').replace(/'/g, "''");
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command,
    ], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function printRawToDesktopPrinter({ dataBase64, deviceName, title }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') {
    return { ok: false, error: 'invalid_data' };
  }

  const printerList = await listDesktopPrinters();
  const resolvedPrinter = printerList.find((printer) => printer.id === deviceName || printer.name === deviceName)
    || printerList.find((printer) => printer.isDefault)
    || printerList[0];

  if (!resolvedPrinter) {
    return { ok: false, error: 'no_printer_available' };
  }

  const printerName = escapePowerShellSingleQuoted(resolvedPrinter.id);
  const rawData = escapePowerShellSingleQuoted(dataBase64);
  const docTitle = escapePowerShellSingleQuoted(title || 'START POS Receipt');
  const command = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@;

$printerName = '${printerName}';
$docName = '${docTitle}';
$bytes = [Convert]::FromBase64String('${rawData}');
$hPrinter = [IntPtr]::Zero;
$docInfo = New-Object RawPrinterHelper+DOCINFOA;
$docInfo.pDocName = $docName;
$docInfo.pDataType = 'RAW';
$written = 0;

if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
  throw "OpenPrinter failed for $printerName";
}

try {
  if (-not [RawPrinterHelper]::StartDocPrinter($hPrinter, 1, $docInfo)) {
    throw "StartDocPrinter failed";
  }
  try {
    if (-not [RawPrinterHelper]::StartPagePrinter($hPrinter)) {
      throw "StartPagePrinter failed";
    }
    try {
      if (-not [RawPrinterHelper]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
        throw "WritePrinter failed";
      }
      if ($written -ne $bytes.Length) {
        throw "WritePrinter wrote $written of $($bytes.Length) bytes";
      }
    } finally {
      [void][RawPrinterHelper]::EndPagePrinter($hPrinter);
    }
  } finally {
    [void][RawPrinterHelper]::EndDocPrinter($hPrinter);
  }
} finally {
  [void][RawPrinterHelper]::ClosePrinter($hPrinter);
}

Write-Output 'OK'
`;

  try {
    await runPowerShell(command);
    return { ok: true, printer: resolvedPrinter.id };
  } catch (error) {
    return { ok: false, error: String(error), printer: resolvedPrinter.id };
  }
}

async function waitForPrintWindowReady(printWindow) {
  await printWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const waitForImages = Array.from(document.images || []).map((img) => {
        if (img.complete) {
          return Promise.resolve();
        }
        return new Promise((imageResolve) => {
          const done = () => imageResolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      });

      const waitForFonts = document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();

      Promise.all([waitForFonts, ...waitForImages]).then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 250);
          });
        });
      });
    });
  `, true);
}

async function printHtmlToDesktopPrinter({ html, deviceName, title }) {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'invalid_html' };
  }

  const printerList = await listDesktopPrinters();
  const resolvedPrinter = printerList.find((printer) => printer.id === deviceName || printer.name === deviceName)
    || printerList.find((printer) => printer.isDefault)
    || printerList[0];

  if (!resolvedPrinter) {
    return { ok: false, error: 'no_printer_available' };
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 1200,
    useContentSize: true,
    backgroundColor: '#ffffff',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(buildDesktopPrintDataUrl(html));
    await printWindow.webContents.insertCSS(`
      @page { margin: 0; }
      html, body {
        background: #ffffff !important;
      }
    `);
    await waitForPrintWindowReady(printWindow);
    const result = await new Promise((resolve) => {
      printWindow.webContents.print(buildDesktopPrintOptions(resolvedPrinter.id, html), (success, failureReason) => {
        resolve({
          ok: !!success,
          error: success ? undefined : (failureReason || 'print_failed'),
          printer: resolvedPrinter.id,
          title: title || null,
        });
      });
    });
    setTimeout(() => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    }, 1500);
    return result;
  } catch (error) {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
    return { ok: false, error: String(error) };
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('desktop-printers:list', async () => listDesktopPrinters());
  ipcMain.handle('desktop-printers:print-html', async (_event, payload) => printHtmlToDesktopPrinter(payload || {}));
  ipcMain.handle('desktop-printers:print-raw', async (_event, payload) => printRawToDesktopPrinter(payload || {}));
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
