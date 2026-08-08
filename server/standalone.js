/**
 * Minimal standalone HTTP server for mobile/Tailscale access.
 *
 * Uses Node's built-in `http` module (no Express dependency).
 * Reuses StateManager + fileOps from services/ for all logic.
 *
 * Usage:
 *   node server/standalone.js [--port 3000] [--data-dir ./data]
 *
 * Or programmatically:
 *   const { createServer } = require('./server/standalone');
 *   const app = createServer(projectDir, { dataDir: '/path/to/data' });
 *   app.listen(port);
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { StateManager } = require('../services/StateManager');
const { scanFolder, readFilePreview } = require('../services/fileOps');
const { PreviewService } = require('../services/previewService');

// ── MIME types for static serving ─────────────────────────────────
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
};

// ── Authorization ─────────────────────────────────────────────────

/** Normalize a socket remote address for loopback detection. */
function isLoopbackAddress(remoteAddress) {
  if (!remoteAddress) return false;
  const addr = remoteAddress.toLowerCase();
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Decide whether an API request is authorized.
 *
 * Loopback requests (the desktop window itself) are always trusted.
 * Remote requests must present the pairing token as a Bearer token.
 * When no token is configured, all requests are allowed (dev mode).
 */
function authorizeRequest(remoteAddress, authHeader, token) {
  if (isLoopbackAddress(remoteAddress)) return true;
  if (!token) return true;
  if (typeof authHeader !== 'string') return false;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;
  const presented = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(presented, expected);
}

/** Find the first non-internal IPv4 address (LAN IP) for CLI output. */
function findLanIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

/**
 * Create the standalone HTTP server.
 *
 * @param {string} projectDir  Root directory (for serving dist/ static files).
 * @param {object} [options]
 * @param {string} [options.dataDir]  Directory for state persistence.
 * @param {string|null} [options.token]  Pairing token required for remote
 *   (non-loopback) API requests. Null/undefined disables token auth.
 * @param {Function} [options.docxRenderer]  Optional DOCX-to-image renderer
 *   (provided by Electron for rich document previews).
 */
function createServer(projectDir, options = {}) {
  const dataDir = options.dataDir || projectDir;
  let token = options.token || null;
  const manager = new StateManager(dataDir);
  const previewService = new PreviewService(dataDir, { docxRenderer: options.docxRenderer });
  const distDir = path.join(projectDir, 'dist');

  const server = http.createServer((req, res) => {
    // Use async IIFE so we can await readBody
    handleRequest(req, res).catch((err) => {
      console.error('[standalone] Unhandled error:', err.message);
      if (!res.headersSent) {
        respondJson(res, 500, { error: err.message });
      }
    });
  });

  async function handleRequest(req, res) {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // ── Authorization gate for all API routes ───────────────────
      if (pathname.startsWith('/api/')) {
        if (!authorizeRequest(req.socket.remoteAddress, req.headers.authorization, token)) {
          respondJson(res, 401, { error: 'Invalid or missing pairing token' });
          return;
        }
      }

      // ── API routes ────────────────────────────────────────────
      if (pathname === '/api/state' && req.method === 'GET') {
        respondJson(res, 200, manager.getState());
        return;
      }

      if (pathname === '/api/folder' && req.method === 'POST') {
        const body = await readBody(req);
        const { folderPath } = JSON.parse(body);
        if (!folderPath) return respondJson(res, 400, { error: 'folderPath is required' });
        if (!fs.existsSync(folderPath)) return respondJson(res, 400, { error: 'Folder does not exist' });
        const files = scanFolder(folderPath);
        manager.setFolder(folderPath, files);
        respondJson(res, 200, { files });
        return;
      }

      if (pathname === '/api/sort' && req.method === 'POST') {
        const body = await readBody(req);
        const { fileId, action } = JSON.parse(body);
        if (!fileId || !action) return respondJson(res, 400, { error: 'fileId and action are required' });
        const state = manager.getState();
        const file = state.files.find((f) => f.id === fileId);
        if (!file) return respondJson(res, 404, { error: 'File not found in queue' });
        manager.executeSort(file, action);
        respondJson(res, 200, { remaining: manager.getState().files.length, history: manager.getState().history.length });
        return;
      }

      if (pathname === '/api/undo' && req.method === 'POST') {
        const record = manager.undoLastSort();
        if (!record) return respondJson(res, 400, { error: 'Nothing to undo' });
        respondJson(res, 200, { ok: true, undoRecord: record, state: manager.getState() });
        return;
      }

      if (pathname === '/api/history' && req.method === 'GET') {
        respondJson(res, 200, manager.getState().history);
        return;
      }

      if (pathname === '/api/clear-history' && req.method === 'POST') {
        manager.clearHistory();
        respondJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/undo-stack' && req.method === 'GET') {
        respondJson(res, 200, manager.getUndoStack());
        return;
      }

      if (pathname === '/api/reset' && req.method === 'POST') {
        manager.reset();
        respondJson(res, 200, { ok: true });
        return;
      }

      // ── API: get file preview (image, text, or rich content) ──
      const previewMatch = pathname.match(/^\/api\/preview\/(.+)$/);
      if (previewMatch && req.method === 'GET') {
        const fileId = decodeURIComponent(previewMatch[1]);
        const state = manager.getState();
        const file = state.files.find((f) => f.id === fileId);
        if (!file) {
          return respondJson(res, 404, { error: 'File not found in queue' });
        }
        // Use PreviewService for Tier 3 generation (with caching)
        const preview = await previewService.getPreview(file.uri, file.extension);
        if (!preview) {
          return respondJson(res, 415, { error: 'Preview not available for this file type' });
        }
        const data = preview.type === 'image' ? preview.data : Buffer.from(preview.data, 'utf-8');
        res.writeHead(200, { 'Content-Type': preview.contentType });
        res.end(data);
        return;
      }

      // ── API: pregenerate previews for next N files ────────────
      if (pathname === '/api/previews/pregenerate' && req.method === 'POST') {
        const body = await readBody(req);
        const { count = 5 } = JSON.parse(body);
        const state = manager.getState();
        const files = state.files.slice(0, count).map((f) => ({
          uri: f.uri,
          extension: f.extension,
        }));
        await previewService.pregeneratePreviews(files);
        respondJson(res, 200, { ok: true });
        return;
      }

      // ── Static file serving ────────────────────────────────────
      if (req.method === 'GET') {
        const filePath = pathname === '/' || pathname === ''
          ? path.join(distDir, 'index.html')
          : path.join(distDir, pathname);

        // Prevent directory traversal
        if (!filePath.startsWith(distDir)) {
          respondJson(res, 403, { error: 'Forbidden' });
          return;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME[ext] || 'application/octet-stream';
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
          return;
        }

        // SPA fallback: serve index.html for any non-file route
        const indexHtml = path.join(distDir, 'index.html');
        if (fs.existsSync(indexHtml)) {
          const content = fs.readFileSync(indexHtml);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
          return;
        }

        respondJson(res, 404, { error: 'Not found' });
        return;
      }

      respondJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error('[standalone] Error:', err.message);
      respondJson(res, 500, { error: err.message });
    }
  }

  /** Update the pairing token at runtime (used by Electron on token reset). */
  server.setToken = (newToken) => {
    token = newToken || null;
  };

  return server;
}

// ── Helpers ───────────────────────────────────────────────────────

function respondJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── CLI entry point ───────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3456;
  const tokenIdx = args.indexOf('--token');
  const token = tokenIdx !== -1 && args[tokenIdx + 1]
    ? args[tokenIdx + 1]
    : crypto.randomBytes(32).toString('hex');
  const dataDir = process.env.FILE_SORTER_DATA_DIR || __dirname;

  const server = createServer(path.join(__dirname, '..'), { dataDir, token });
  server.listen(port, () => {
    console.log(`[standalone] File Sorter server on http://localhost:${port}`);
    console.log(`[standalone] Data directory: ${dataDir}`);
    const lanIp = findLanIPv4();
    if (lanIp) {
      console.log(`[standalone] Mobile access: http://${lanIp}:${port}/?t=${token}`);
    } else {
      console.log(`[standalone] Pairing token (append as ?t=...): ${token}`);
    }
  });
}

module.exports = { createServer, authorizeRequest, isLoopbackAddress };
