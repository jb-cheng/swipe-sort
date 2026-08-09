/**
 * Tests for services/StateManager.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { StateManager } = require('../services/StateManager');

describe('StateManager', () => {
  let tmpdir;
  let mgr;

  const makeFile = (name, ext) => ({
    id: `file-${name}`,
    name,
    extension: ext,
    type: 'doc',
    size: '1 KB',
    date: '2025-01-01',
    uri: path.join(tmpdir, `${name}.${ext}`),
  });

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-sm-'));
    // Create a test file on disk
    fs.writeFileSync(path.join(tmpdir, 'test.txt'), 'hello');
    fs.writeFileSync(path.join(tmpdir, 'photo.jpg'), 'image');
    mgr = new StateManager(tmpdir);
  });

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  // ── Initial state ──────────────────────────────────────────────

  test('starts with empty state', () => {
    const state = mgr.getState();
    expect(state.folderPath).toBeNull();
    expect(state.files).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.undoStack).toEqual([]);
  });

  // ── setFolder ──────────────────────────────────────────────────

  test('setFolder updates folder and files', () => {
    const files = [makeFile('test', 'txt')];
    mgr.setFolder(tmpdir, files);
    const state = mgr.getState();
    expect(state.folderPath).toBe(tmpdir);
    expect(state.files).toEqual(files);
  });

  test('setFolder resets history and undo stack', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    const action = { id: 'keep', label: 'Keep' };
    mgr.executeSort(mgr.getState().files[0], action);

    // Now call setFolder again
    mgr.setFolder('/new/path', [makeFile('new', 'txt')]);
    const state = mgr.getState();
    expect(state.history.length).toBe(0);
    expect(state.undoStack.length).toBe(0);
  });

  // ── executeSort ────────────────────────────────────────────────

  test('executeSort moves file and updates state', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    const file = mgr.getState().files[0];
    const action = { id: 'keep', label: 'Keep', key: '1', direction: 'right', color: '#22C55E' };

    const undoRecord = mgr.executeSort(file, action);

    expect(undoRecord).toHaveProperty('id');
    expect(undoRecord.sourcePath).toBe(path.join(tmpdir, 'test.txt'));
    expect(undoRecord.destPath).toBe(path.join(tmpdir, 'Keep', 'test.txt'));

    // Queue should be empty
    expect(mgr.getState().files.length).toBe(0);

    // History should have one entry
    expect(mgr.getState().history.length).toBe(1);

    // Undo stack should have one entry
    expect(mgr.getState().undoStack.length).toBe(1);

    // File should exist at destination
    expect(fs.existsSync(undoRecord.destPath)).toBe(true);
    expect(fs.existsSync(undoRecord.sourcePath)).toBe(false);
  });

  // ── undoLastSort ───────────────────────────────────────────────

  test('undoLastSort restores file and state', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    const file = mgr.getState().files[0];
    const action = { id: 'keep', label: 'Keep' };

    mgr.executeSort(file, action);

    const undone = mgr.undoLastSort();
    expect(undone).not.toBeNull();

    const state = mgr.getState();
    expect(state.files.length).toBe(1);
    expect(state.undoStack.length).toBe(0);

    // File should be back at source
    expect(fs.existsSync(path.join(tmpdir, 'test.txt'))).toBe(true);
  });

  test('undoLastSort returns null when nothing to undo', () => {
    const result = mgr.undoLastSort();
    expect(result).toBeNull();
  });

  test('undoLastSort restores file to front of queue', () => {
    const files = [makeFile('a', 'txt'), makeFile('b', 'txt')];
    // Create both files on disk
    fs.writeFileSync(path.join(tmpdir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmpdir, 'b.txt'), 'b');
    mgr.setFolder(tmpdir, files);

    // Sort both
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    expect(mgr.getState().files.length).toBe(0);

    // Undo once — should restore the second sorted file
    const undone = mgr.undoLastSort();
    expect(undone).not.toBeNull();
    expect(mgr.getState().files.length).toBe(1);
    expect(mgr.getState().files[0].name).toBe('b');

    // Undo again — should restore the first sorted file
    mgr.undoLastSort();
    expect(mgr.getState().files.length).toBe(2);
  });

  test('undoLastSort stops working if file was externally deleted', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    // Delete the moved file externally
    const state = mgr.getState();
    const undoRec = state.undoStack[0];
    fs.unlinkSync(undoRec.destPath);

    // Undo should throw
    expect(() => mgr.undoLastSort()).toThrow();
  });

  // ── undoHistoryItem (per-item undo) ────────────────────────

  test('undoHistoryItem restores the matching file to the front of the queue', () => {
    const files = [makeFile('a', 'txt'), makeFile('b', 'txt')];
    fs.writeFileSync(path.join(tmpdir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmpdir, 'b.txt'), 'b');
    mgr.setFolder(tmpdir, files);

    // Sort both files (a first, b second)
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });
    mgr.executeSort(mgr.getState().files[0], { id: 'r', label: 'Review' });
    expect(mgr.getState().files.length).toBe(0);
    expect(mgr.getState().history.length).toBe(2);

    // Undo the FIRST sorted file (not the last one)
    const entryA = mgr.getState().history.find((h) => h.file.name === 'a');
    const undone = mgr.undoHistoryItem(entryA.id);
    expect(undone.sourcePath).toBe(path.join(tmpdir, 'a.txt'));

    const state = mgr.getState();
    // Restored file is at the top of the queue with its original uri
    expect(state.files.length).toBe(1);
    expect(state.files[0].name).toBe('a');
    expect(state.files[0].uri).toBe(path.join(tmpdir, 'a.txt'));
    // Only the matching history and undo entries were removed
    expect(state.history.length).toBe(1);
    expect(state.history[0].file.name).toBe('b');
    expect(state.undoStack.length).toBe(1);
    // File moved back on disk
    expect(fs.existsSync(path.join(tmpdir, 'a.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpdir, 'Keep', 'a.txt'))).toBe(false);
  });

  test('undoHistoryItem throws for an unknown history id', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });
    expect(() => mgr.undoHistoryItem('does-not-exist')).toThrow('History entry not found');
  });

  test('undoHistoryItem throws when the undo record was already consumed', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    const historyId = mgr.getState().history[0].id;
    // Simulate the undo record being consumed elsewhere while the history
    // entry lingers (e.g. hand-edited state file).
    mgr.state.undoStack = [];

    expect(() => mgr.undoHistoryItem(historyId)).toThrow('can no longer be undone');
    // Nothing was moved or re-queued
    expect(mgr.getState().files.length).toBe(0);
    expect(mgr.getState().history.length).toBe(1);
  });

  test('undoHistoryItem throws when a different folder is now active', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    const historyId = mgr.getState().history[0].id;
    // Simulate a folder switch without clearing history
    mgr.state.folderPath = path.join(tmpdir, 'elsewhere');

    expect(() => mgr.undoHistoryItem(historyId)).toThrow('different folder');
    // File stays where it was sorted
    expect(fs.existsSync(path.join(tmpdir, 'Keep', 'test.txt'))).toBe(true);
  });

  test('undoHistoryItem throws if the sorted file was externally deleted', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    const entry = mgr.getState().history[0];
    fs.unlinkSync(entry.file.uri);

    expect(() => mgr.undoHistoryItem(entry.id)).toThrow();
  });

  // ── State persistence ──────────────────────────────────────────

  test('persists state to disk and reloads it', () => {
    const file = makeFile('test', 'txt');
    mgr.setFolder(tmpdir, [file]);
    mgr.executeSort(file, { id: 'k', label: 'Keep' });

    // Create a new StateManager with the same data dir
    const mgr2 = new StateManager(tmpdir);
    const state = mgr2.getState();
    expect(state.folderPath).toBe(tmpdir);
    expect(state.history.length).toBe(1);
    expect(state.undoStack.length).toBe(1);
    // Files should be empty since we sorted the only file
    expect(state.files.length).toBe(0);
  });

  test('handles corrupt state file gracefully', () => {
    fs.writeFileSync(path.join(tmpdir, 'file-sorter-state.json'), 'not valid json');
    // Should not throw, start with default state
    const mgr2 = new StateManager(tmpdir);
    expect(mgr2.getState().folderPath).toBeNull();
  });

  // ── reset ──────────────────────────────────────────────────────

  test('reset clears all state', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });
    mgr.reset();

    const state = mgr.getState();
    expect(state.folderPath).toBeNull();
    expect(state.files).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.undoStack).toEqual([]);
  });

  // ── clearHistory ────────────────────────────────────────────────

  test('clearHistory clears history and undo stack but keeps folder and queue', () => {
    const files = [makeFile('test', 'txt')];
    mgr.setFolder(tmpdir, files);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    expect(mgr.getState().history.length).toBe(1);
    expect(mgr.getState().undoStack.length).toBe(1);

    mgr.clearHistory();

    const state = mgr.getState();
    expect(state.history).toEqual([]);
    expect(state.undoStack).toEqual([]);
    // Folder and files (queue) should be untouched
    expect(state.folderPath).toBe(tmpdir);
    expect(state.files).toEqual([]);
  });

  test('clearHistory is idempotent when already empty', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.clearHistory();

    const state = mgr.getState();
    expect(state.history).toEqual([]);
    expect(state.undoStack).toEqual([]);
    expect(state.files.length).toBe(1);
  });

  // ── peekUndo / getUndoStack ────────────────────────────────────

  test('peekUndo returns last record without removing it', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    const peek = mgr.peekUndo();
    expect(peek).not.toBeNull();
    expect(mgr.getState().undoStack.length).toBe(1);
  });

  test('getUndoStack returns a copy', () => {
    mgr.setFolder(tmpdir, [makeFile('test', 'txt')]);
    mgr.executeSort(mgr.getState().files[0], { id: 'k', label: 'Keep' });

    const stack = mgr.getUndoStack();
    expect(stack.length).toBe(1);

    // Mutating the returned array should not affect internal state
    stack.push('junk');
    expect(mgr.getState().undoStack.length).toBe(1);
  });

  // ── null dataDir doesn't crash ─────────────────────────────────

  test('works with null data dir (no persistence)', () => {
    const tmpDir2 = path.join(os.tmpdir(), 'fs-sm-null-' + Date.now());
    fs.mkdirSync(tmpDir2, { recursive: true });
    const mgr2 = new StateManager(tmpDir2);
    expect(mgr2.getState().folderPath).toBeNull();
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });
});
