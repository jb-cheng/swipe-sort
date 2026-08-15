const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('../server/standalone');
const mobileAccess = require('./mobile-access');

let mainWindow;
let appServer = null;
let serverPort = null;
let mobileConfig = null;
let captureWindow = null;
let captureLock = Promise.resolve();
let rebindLock = Promise.resolve();

// ── DOCX visual capture (hidden BrowserWindow) ────────────────────

async function getCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;
  captureWindow = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  return captureWindow;
}

async function docxRenderer(html) {
  captureLock = captureLock.then(async () => {
    const win = await getCaptureWindow();
    const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',sans-serif;font-size:13px;padding:16px;margin:0;color:#1a1a1a;background:#fff;width:320px;overflow:hidden}img{max-width:100%}</style></head><body>${html}</body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(wrapped));
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    return image.toPNG();
  }).catch((err) => {
    console.warn('[electron] DOCX capture failed:', err.message);
    if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.destroy(); captureWindow = null; }
    return null;
  });
  return captureLock;
}

// ── CLI flag parsing ──────────────────────────────────────────────
const args = process.argv.slice(2);
const servePortIndex = args.indexOf('--serve');
const REQUESTED_PORT = servePortIndex !== -1 && args[servePortIndex + 1]
  ? parseInt(args[servePortIndex + 1], 10)
  : mobileAccess.DEFAULT_PORT;

// ── App server lifecycle ──────────────────────────────────────────
//
// The standalone HTTP server is the single source of truth for all app
// state (queue, history, undo). The desktop window and any paired phone
// both talk to it over HTTP. IPC is reserved for native capabilities
// that HTTP cannot provide (folder picker dialog, shell actions, window
// controls).

function bindHost() {
  // Mobile access disabled: listen on loopback only, invisible to the LAN.
  // Enabled: listen on all interfaces; remote requests still require the
  // pairing token (enforced by the server).
  return mobileConfig.enabled ? '0.0.0.0' : '127.0.0.1';
}

function startServer() {
  return new Promise((resolve, reject) => {
    const host = bindHost();
    const tryListen = (port) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE' && port !== 0) {
          console.warn(`[electron] Port ${port} in use, falling back to a free port`);
          appServer.removeListener('error', onError);
          tryListen(0);
        } else {
          reject(err);
        }
      };
      appServer.once('error', onError);
      appServer.listen(port, host, () => {
        appServer.removeListener('error', onError);
        serverPort = appServer.address().port;
        console.log(
          `[electron] App server on http://${host}:${serverPort}` +
          ` (mobile access ${mobileConfig.enabled ? 'enabled' : 'disabled'})`,
        );
        resolve();
      });
    };
    tryListen(REQUESTED_PORT);
  });
}

/** Re-bind the server after the bind host changes (mobile access toggle). */
function restartServer() {
  return new Promise((resolve, reject) => {
    if (!appServer) return resolve();
    appServer.closeAllConnections();
    appServer.close(() => {
      serverPort = null;
      startServer().then(resolve).catch(reject);
    });
  });
}

/**
 * Re-bind only when the actual bind address differs from the desired one.
 * Lets queued toggles coalesce into a single rebind.
 */
function rebindIfNeeded() {
  if (!appServer) return;
  const address = appServer.address();
  if (address && address.address === bindHost()) return;
  return restartServer();
}

/** Snapshot of mobile access info for the renderer. */
function getMobileAccessInfo() {
  const lanIp = mobileAccess.getLanIPv4();
  return {
    enabled: mobileConfig.enabled,
    port: serverPort,
    lanIp,
    url: lanIp && serverPort
      ? mobileAccess.buildPairingUrl(lanIp, serverPort, mobileConfig.token)
      : null,
    token: mobileConfig.token,
  };
}

function broadcastMobileAccess() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mobile-access-changed', getMobileAccessInfo());
  }
}

/**
 * Enable or disable mobile (LAN) access. Single entry point used by both
 * the desktop IPC handler and the paired phone's HTTP toggle request.
 * Re-binds the server only when the flag actually changes.
 */
async function applyMobileAccessEnabled(enabled) {
  const next = enabled === true;
  mobileConfig.enabled = next;
  mobileAccess.saveConfig(app.getPath('userData'), mobileConfig);
  // Serialize rebinds: concurrent toggles from desktop IPC and the phone's
  // HTTP request must not race on server.close().
  rebindLock = rebindLock.then(rebindIfNeeded).catch((err) => {
    console.warn('[electron] Server rebind failed:', err.message);
  });
  await rebindLock;
  broadcastMobileAccess();
  return getMobileAccessInfo();
}

// ── App ready ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  mobileConfig = mobileAccess.loadConfig(userDataPath);

  const projectDir = path.join(__dirname, '..');
  appServer = createServer(projectDir, {
    dataDir: userDataPath,
    token: mobileConfig.token,
    docxRenderer,
    // Lets a paired phone read and toggle mobile access over HTTP so the
    // sort lock can be released from either platform.
    isMobileAccessEnabled: () => mobileConfig.enabled,
    onMobileAccessToggle: (enabled) => {
      applyMobileAccessEnabled(enabled).catch((err) => {
        console.warn('[electron] Mobile access toggle failed:', err.message);
      });
    },
  });

  await startServer();

  // Create the main window, served by the app server itself
  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 380,
    minHeight: 600,
    title: 'File Sorter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Use the loopback IP, not `localhost`: it resolves deterministically and
  // matches the server's Host allow-list without name-resolution surprises.
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // Apply persisted window settings (stay-on-top, etc.)
  const settings = loadWindowSettings();
  if (settings.alwaysOnTop) {
    applyAlwaysOnTop(true);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    broadcastMobileAccess();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});

// ── IPC handlers: native capabilities only ────────────────────────

/** Native folder picker dialog. */
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a folder to sort',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

/** Get the OS-native file icon (Tier 2 preview). */
ipcMain.handle('get-native-icon', async (_event, filePath) => {
  try {
    const nativeImage = await app.getFileIcon(filePath);
    if (nativeImage) {
      // toDataURL() returns a complete "data:image/png;base64,..." string
      return { type: 'image', dataUrl: nativeImage.toDataURL() };
    }
  } catch (err) {
    console.warn('[electron] getFileIcon failed:', err.message);
  }
  return null;
});

/** Open a file with the OS default application. */
ipcMain.handle('open-file', async (_event, filePath) => {
  await shell.openPath(filePath);
});

/** Reveal a file in the OS file explorer (Finder on macOS). */
ipcMain.handle('reveal-in-folder', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ── IPC handlers: mobile access ───────────────────────────────────

/** Current mobile access status (enabled, port, pairing URL, token). */
ipcMain.handle('get-mobile-access', () => {
  return getMobileAccessInfo();
});

/** Enable or disable LAN access; re-binds the server accordingly. */
ipcMain.handle('set-mobile-access-enabled', (_event, enabled) => {
  return applyMobileAccessEnabled(enabled);
});

/** Rotate the pairing token; previously paired phones must re-scan. */
ipcMain.handle('reset-mobile-token', async () => {
  mobileConfig.token = mobileAccess.generateToken();
  mobileAccess.saveConfig(app.getPath('userData'), mobileConfig);
  if (appServer) {
    appServer.setToken(mobileConfig.token);
  }
  broadcastMobileAccess();
  return getMobileAccessInfo();
});

// ── Window settings (stay-on-top) ─────────────────────────────────

const SETTINGS_FILE = 'file-sorter-settings.json';

function loadWindowSettings() {
  try {
    const settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[electron] Failed to load settings:', err.message);
  }
  return {};
}

function saveWindowSettings(settings) {
  try {
    const settingsPath = path.join(app.getPath('userData'), SETTINGS_FILE);
    const existing = loadWindowSettings();
    const merged = { ...existing, ...settings };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.warn('[electron] Failed to save settings:', err.message);
  }
}

/** Apply stay-on-top preference to the window. */
function applyAlwaysOnTop(enabled) {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enabled);
  }
}

/** IPC: set always-on-top and persist. */
ipcMain.handle('set-always-on-top', async (_event, enabled) => {
  applyAlwaysOnTop(enabled);
  saveWindowSettings({ alwaysOnTop: enabled });
  return { ok: true };
});

/** IPC: get current always-on-top setting. */
ipcMain.handle('get-always-on-top', async () => {
  const settings = loadWindowSettings();
  return { enabled: settings.alwaysOnTop === true };
});

// ── App lifecycle ─────────────────────────────────────────────────

app.on('window-all-closed', () => {
  if (captureWindow && !captureWindow.isDestroyed()) captureWindow.destroy();
  if (appServer) appServer.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && serverPort) {
    mainWindow = new BrowserWindow({
      width: 420,
      height: 780,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  }
});
