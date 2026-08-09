const express = require('express');
const path = require('path');
const fs = require('fs');
const { StateManager } = require('../services/StateManager');
const { scanFolder, readFilePreview } = require('../services/fileOps');

/**
 * Create an Express server that wraps StateManager over HTTP.
 * Used by legacy clients and as the mobile-access server.
 *
 * @param {string} projectDir  Root directory of the project (for serving dist/).
 * @param {object} [options]
 * @param {string} [options.dataDir]  Directory for state persistence.
 *   Defaults to projectDir (standalone mode).
 */
function createServer(projectDir, options = {}) {
  const dataDir = options.dataDir || projectDir;
  const manager = new StateManager(dataDir);

  const app = express();
  app.use(express.json());

  // Serve the built web app
  const distDir = path.join(projectDir, 'dist');
  app.use(express.static(distDir));

  // ── API: get current state ──────────────────────────────────────
  app.get('/api/state', (_req, res) => {
    res.json(manager.getState());
  });

  // ── API: set folder and scan files ──────────────────────────────
  app.post('/api/folder', (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: 'folderPath is required' });
    }
    if (!require('fs').existsSync(folderPath)) {
      return res.status(400).json({ error: 'Folder does not exist' });
    }

    try {
      const files = scanFolder(folderPath);
      manager.setFolder(folderPath, files);
      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read folder: ' + err.message });
    }
  });

  // ── API: sort a file (move to action-named subfolder) ──────────
  app.post('/api/sort', (req, res) => {
    const { fileId, action } = req.body;
    if (!fileId || !action) {
      return res.status(400).json({ error: 'fileId and action are required' });
    }

    const state = manager.getState();
    const file = state.files.find((f) => f.id === fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found in queue' });
    }

    try {
      manager.executeSort(file, action);
      const state = manager.getState();
      res.json({ remaining: state.files.length, history: state.history.length, undoStackLength: manager.getUndoStack().length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to move file: ' + err.message });
    }
  });

  // ── API: undo last sort ────────────────────────────────────────
  app.post('/api/undo', (_req, res) => {
    try {
      const record = manager.undoLastSort();
      if (!record) {
        return res.status(400).json({ error: 'Nothing to undo' });
      }
      res.json({ ok: true, undoRecord: record, state: manager.getState() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to undo: ' + err.message });
    }
  });

  // ── API: undo a specific history entry (per-item undo) ─────────
  app.post('/api/history/undo', (req, res) => {
    const { historyId } = req.body;
    if (!historyId) {
      return res.status(400).json({ error: 'historyId is required' });
    }
    try {
      const record = manager.undoHistoryItem(historyId);
      res.json({ ok: true, undoRecord: record, state: manager.getState() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── API: get history ────────────────────────────────────────────
  app.get('/api/history', (_req, res) => {
    res.json(manager.getState().history);
  });

  // ── API: clear history (keeps folder, queue, undo) ───────────
  app.post('/api/clear-history', (_req, res) => {
    manager.clearHistory();
    res.json({ ok: true });
  });

  // ── API: get undo stack ─────────────────────────────────────────
  app.get('/api/undo-stack', (_req, res) => {
    const state = manager.getState();
    res.json(state.undoStack || []);
  });

  // ── API: reset (clear all state) ────────────────────────────────
  app.post('/api/reset', (_req, res) => {
    manager.reset();
    res.json({ ok: true });
  });

  // ── API: get file preview (image or text) ─────────────────────────
  app.get('/api/preview/:fileId', (req, res) => {
    const { fileId } = req.params;
    const state = manager.getState();
    const file = state.files.find((f) => f.id === fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found in queue' });
    }

    try {
      const preview = readFilePreview(file.uri, file.extension);
      if (!preview) {
        return res.status(415).json({ error: 'Preview not available for this file type' });
      }
      res.setHeader('Content-Type', preview.contentType);
      res.end(preview.data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read file: ' + err.message });
    }
  });

  // ── SPA fallback: serve index.html for unmatched GET routes ────
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
    } else {
      next();
    }
  });

  return app;
}

module.exports = { createServer };
