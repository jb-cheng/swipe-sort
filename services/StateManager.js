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

  /**
   * Undo a specific history entry by id (per-item undo from the History tab).
   *
   * Moves the file back to its original location and re-queues it at the
   * front of the queue. Throws if the entry is unknown, its undo record was
   * already consumed, the folder has since changed, or the file is gone.
   *
   * @param {string} historyId  Id of the history record to undo.
   * @returns {object} The undo record that was applied.
   */
  undoHistoryItem(historyId) {
    const histIdx = this.state.history.findIndex((h) => h.id === historyId);
    if (histIdx === -1) {
      throw new Error('History entry not found');
    }
    const record = this.state.history[histIdx];

    // The undo record is matched by destination path: history stores the
    // post-sort path in file.uri.
    const undoIdx = this.state.undoStack.findIndex((u) => u.destPath === record.file.uri);
    if (undoIdx === -1) {
      throw new Error('This entry can no longer be undone');
    }
    const undoRecord = this.state.undoStack[undoIdx];

    // A restored file only belongs to the queue of the folder it was sorted
    // from. Refuse if the user has since switched folders (or cleared them).
    if (!this.state.folderPath || path.dirname(undoRecord.sourcePath) !== this.state.folderPath) {
      throw new Error('Cannot undo: a different folder is now active');
    }

    // Move the file back on disk (throws if it was moved/deleted externally)
    execUndo(undoRecord);

    this.state.undoStack.splice(undoIdx, 1);
    this.state.history.splice(histIdx, 1);

    // Re-add the file to the front of the queue with its original URI
    const restoredFile = { ...undoRecord.file, uri: undoRecord.sourcePath };
    this.state.files.unshift(restoredFile);

    this._save();
    return undoRecord;
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
