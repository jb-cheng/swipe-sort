/**
 * Persisted state manager for File Sorter.
 *
 * Manages queue, history, and undo stack in memory and persists
 * to a JSON file on every mutation. Used by both the Electron main
 * process and the standalone server.
 */
const fs = require('fs');
const path = require('path');
const { sortFile: execSort, undoSort: execUndo } = require('./fileOps');

const STATE_FILE = 'file-sorter-state.json';

class StateManager {
  /**
   * @param {string} dataDir  Directory where the state JSON is stored.
   *   In Electron, use app.getPath('userData'); in standalone, a provided path.
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, STATE_FILE);
    this.state = this._defaultState();
    this._load();
  }

  // ── Internal helpers ────────────────────────────────────────────

  _defaultState() {
    return {
      folderPath: null,
      files: [],
      history: [],
      undoStack: [],
    };
  }

  _load() {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure all keys exist in case the file format has evolved
        this.state = { ...this._defaultState(), ...parsed };
      }
    } catch (err) {
      console.warn('[StateManager] Could not load state file, starting fresh:', err.message);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('[StateManager] Failed to save state:', err.message);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Return a shallow copy of the current state. */
  getState() {
    return { ...this.state, files: [...this.state.files], history: [...this.state.history] };
  }

  /**
   * Set the active folder and its scanned files.
   * Resets history and undo stack.
   */
  setFolder(folderPath, files) {
    this.state.folderPath = folderPath;
    this.state.files = files;
    this.state.history = [];
    this.state.undoStack = [];
    this._save();
  }

  /**
   * Execute a sort (move file on disk) and update state.
   * @returns {object} undoRecord for the operation.
   */
  executeSort(file, action) {
    // Move the file on disk
    const paths = execSort(file, action);

    // Remove from queue
    const idx = this.state.files.findIndex((f) => f.id === file.id);
    if (idx !== -1) this.state.files.splice(idx, 1);

    // Build undo record
    const undoRecord = {
      id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: { ...file, uri: paths.destPath },
      action: { ...action },
      sourcePath: paths.sourcePath,
      destPath: paths.destPath,
      timestamp: Date.now(),
    };
    this.state.undoStack.push(undoRecord);

    // Add history entry
    const historyRecord = {
      id: `${Date.now()}-${file.id}`,
      file: { ...file, uri: paths.destPath },
      action: { ...action },
      timestamp: Date.now(),
    };
    this.state.history.unshift(historyRecord);

    this._save();
    return undoRecord;
  }

  /**
   * Undo the last sort operation (pop from stack, move file back).
   * @returns {object|null} The undone record, or null if stack is empty.
   */
  undoLastSort() {
    if (this.state.undoStack.length === 0) return null;

    const record = this.state.undoStack.pop();

    // Move the file back on disk
    execUndo(record);

    // Re-add the file to the front of the queue with its original URI
    const restoredFile = { ...record.file, uri: record.sourcePath };
    this.state.files.unshift(restoredFile);

    // Remove the corresponding history entry (the most recent one for this file)
    const histIdx = this.state.history.findIndex((h) => h.file.uri === record.destPath);
    if (histIdx !== -1) this.state.history.splice(histIdx, 1);

    this._save();
    return record;
  }

  /** Peek at the most recent undo record without popping. */
  peekUndo() {
    return this.state.undoStack.length > 0
      ? this.state.undoStack[this.state.undoStack.length - 1]
      : null;
  }

  /** Return a copy of the undo stack. */
  getUndoStack() {
    return [...this.state.undoStack];
  }

  /** Clear history and undo stack (keeps folder and queue). */
  clearHistory() {
    this.state.history = [];
    this.state.undoStack = [];
    this._save();
  }

  /** Full reset. */
  reset() {
    this.state = this._defaultState();
    this._save();
  }
}

module.exports = { StateManager };
