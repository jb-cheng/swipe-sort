const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { StateManager } = require('../services/StateManager');
const { scanFolder, sortFile, readFilePreview } = require('../services/fileOps');
const { PreviewService } = require('../services/previewService');

let mainWindow;
let manager;
let previewService;
let staticServer = null;
let standaloneServer = null;
let captureWindow = null;
let captureLock = Promise.resolve();

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
const SERVE_PORT = servePortIndex !== -1 && args[servePortIndex + 1]
  ? parseInt(args[servePortIndex + 1], 10)
  : null;

// ── Minimal static file server for dist/ ──────────────────────────
function startStaticServer(distDir) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json',
    '.ttf': 'font/ttf',
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let filePath = url.pathname === '/' ? path.join(distDir, 'index.html') : path.join(distDir, url.pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
    } else {
      // SPA fallback: serve index.html
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(indexHtml));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  });

  return server;
}

// ── App ready ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  manager = new StateManager(userDataPath);
  previewService = new PreviewService(userDataPath, { docxRenderer });

  // Start static file server for the built web app
  const distDir = path.join(__dirname, '..', 'dist');
  staticServer = startStaticServer(distDir);
  staticServer.listen(0, () => {
    const port = staticServer.address().port;
    console.log(`[electron] Static server on http://localhost:${port}`);

    // Create the main window
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

    mainWindow.loadURL(`http://localhost:${port}`);

    // Apply persisted window settings (stay-on-top, etc.)
    const settings = loadWindowSettings();
    if (settings.alwaysOnTop) {
      applyAlwaysOnTop(true);
    }

    // If --serve flag is set, start the standalone server for mobile access
    if (SERVE_PORT) {
      startStandaloneServer(SERVE_PORT);
    } else {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('server-port', null);
      });
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
});

// ── Start optional standalone server (mobile access) ──────────────
function startStandaloneServer(port) {
  const { createServer } = require('../server/standalone');
  const projectDir = path.join(__dirname, '..');
  const userDataPath = app.getPath('userData');
  const app_ = createServer(projectDir, { dataDir: userDataPath });
  standaloneServer = app_.listen(port, () => {
    console.log(`[electron] Standalone server running on http://localhost:${port}`);
    if (mainWindow) {
      mainWindow.webContents.send('server-port', port);
    }
  });
}

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

// ── IPC handlers ──────────────────────────────────────────────────

/** Get the full current state. */
ipcMain.handle('get-state', () => {
  return manager.getState();
});

/** Set the active folder — scans it and returns files. */
ipcMain.handle('set-folder', async (_event, folderPath) => {
  if (!folderPath) throw new Error('folderPath is required');
  const files = scanFolder(folderPath);
  manager.setFolder(folderPath, files);
  return { files };
});

/** Sort a file — move to action-named subfolder. */
ipcMain.handle('sort-file', async (_event, fileId, action) => {
  const state = manager.getState();
  const file = state.files.find((f) => f.id === fileId);
  if (!file) throw new Error('File not found in queue');

  manager.executeSort(file, action);
  return { remaining: manager.getState().files.length, undoStackLength: manager.getUndoStack().length };
});

/** Undo the last sort operation. */
ipcMain.handle('undo-sort', async () => {
  const record = manager.undoLastSort();
  if (!record) throw new Error('Nothing to undo');
  return { ok: true, state: manager.getState() };
});

/** Get history. */
ipcMain.handle('get-history', () => {
  return manager.getState().history;
});

/** Clear server-side history only (keeps folder and queue). */
ipcMain.handle('clear-history', () => {
  manager.clearHistory();
  return { ok: true };
});

/** Get undo stack. */
ipcMain.handle('get-undo-stack', () => {
  return manager.getUndoStack();
});

/** Reset the entire state. */
ipcMain.handle('reset-state', () => {
  manager.reset();
  return { ok: true };
});

/** Native folder picker dialog. */
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a folder to sort',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

/** Get a file preview (image, text, or rich content via Tier 3). */
ipcMain.handle('get-file-preview', async (_event, fileId) => {
  const state = manager.getState();
  const file = state.files.find((f) => f.id === fileId);
  if (!file) throw new Error('File not found in queue');

  // Use PreviewService for Tier 3 generation (with caching)
  const preview = await previewService.getPreview(file.uri, file.extension);
  if (!preview) {
    // Fall back to legacy preview
    const legacy = readFilePreview(file.uri, file.extension);
    if (!legacy) throw new Error('Preview not available for this file type');
    if (legacy.type === 'image') {
      return {
        type: 'image',
        contentType: legacy.contentType,
        base64: legacy.data.toString('base64'),
      };
    }
    return {
      type: 'text',
      contentType: legacy.contentType,
      text: legacy.data,
    };
  }

  if (preview.type === 'image') {
    return {
      type: 'image',
      contentType: preview.contentType,
      base64: preview.data.toString('base64'),
    };
  }
  return {
    type: 'text',
    contentType: preview.contentType,
    text: preview.data,
  };
});

/** Pre-generate previews for the next N files in the queue (lazy loading). */
ipcMain.handle('pregenerate-previews', async (_event, count = 5) => {
  const state = manager.getState();
  const files = state.files.slice(0, count).map((f) => ({
    uri: f.uri,
    extension: f.extension,
  }));
  await previewService.pregeneratePreviews(files);
  return { ok: true };
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
  if (staticServer) staticServer.close();
  if (standaloneServer) standaloneServer.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && staticServer) {
    const port = staticServer.address().port;
    mainWindow = new BrowserWindow({
      width: 420,
      height: 780,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    mainWindow.loadURL(`http://localhost:${port}`);
  }
});
