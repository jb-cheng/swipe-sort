/**
 * Tests for lib/api.ts
 *
 * Since api.ts dynamically picks IPC vs HTTP at runtime, we test each mode
 * by manipulating the environment before importing the module.
 */

// ── Helpers to create mock environments ───────────────────────────

function withElectronAPI(mockApi: Record<string, jest.Mock>) {
  (globalThis as any).window = { electronAPI: mockApi };
}

function withoutElectronAPI() {
  (globalThis as any).window = undefined;
}

// Mock fetch for HTTP mode tests
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as any;

// We use jest.isolateModules so each test file gets a fresh import
// of api.ts.  We define the shared test data here.

const SAMPLE_FILE = { id: 'f1', name: 'test', extension: 'txt', type: 'doc', size: '1 KB', date: '2025-01-01', uri: '/path/test.txt' };
const SAMPLE_ACTION = { id: 'keep', label: 'Keep', key: '1', direction: 'right' as const, color: '#22C55E' };

beforeEach(() => {
  mockFetch.mockReset();
  // Default: no Electron API
  withoutElectronAPI();
});

describe('IPC mode (Electron)', () => {
  let mockAPI: Record<string, jest.Mock>;

  beforeEach(() => {
    mockAPI = {
      getState: jest.fn(),
      setFolder: jest.fn(),
      sortFile: jest.fn(),
      undoSort: jest.fn(),
      getHistory: jest.fn(),
      getUndoStack: jest.fn(),
      resetState: jest.fn(),
      pickFolder: jest.fn(),
    };
    withElectronAPI(mockAPI);
  });

  it('fetchState calls ipc getState', async () => {
    mockAPI.getState.mockResolvedValue({ folderPath: '/test', files: [SAMPLE_FILE], history: [], undoStack: [] });
    const { fetchState } = await import('../lib/api');
    const result = await fetchState();
    expect(mockAPI.getState).toHaveBeenCalledTimes(1);
    expect(result.folderPath).toBe('/test');
  });

  it('setFolder calls ipc setFolder', async () => {
    mockAPI.setFolder.mockResolvedValue({ files: [SAMPLE_FILE] });
    const { setFolder } = await import('../lib/api');
    const result = await setFolder('/my/folder');
    expect(mockAPI.setFolder).toHaveBeenCalledWith('/my/folder');
    expect(result.files).toHaveLength(1);
  });

  it('sortFile calls ipc sortFile', async () => {
    mockAPI.sortFile.mockResolvedValue({ remaining: 0 });
    const { sortFile } = await import('../lib/api');
    const result = await sortFile('f1', SAMPLE_ACTION);
    expect(mockAPI.sortFile).toHaveBeenCalledWith('f1', SAMPLE_ACTION);
    expect(result.remaining).toBe(0);
  });

  it('undoSort calls ipc undoSort', async () => {
    mockAPI.undoSort.mockResolvedValue({ ok: true, state: { files: [SAMPLE_FILE], history: [], undoStack: [] } });
    const { undoSort } = await import('../lib/api');
    const result = await undoSort();
    expect(mockAPI.undoSort).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('fetchHistory calls ipc getHistory', async () => {
    mockAPI.getHistory.mockResolvedValue([{ id: 'h1', file: SAMPLE_FILE, action: SAMPLE_ACTION, timestamp: 100 }]);
    const { fetchHistory } = await import('../lib/api');
    const result = await fetchHistory();
    expect(mockAPI.getHistory).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it('resetServer calls ipc resetState', async () => {
    mockAPI.resetState.mockResolvedValue({ ok: true });
    const { resetServer } = await import('../lib/api');
    await resetServer();
    expect(mockAPI.resetState).toHaveBeenCalledTimes(1);
  });

  it('fetchUndoStack calls ipc getUndoStack', async () => {
    mockAPI.getUndoStack.mockResolvedValue([{ id: 'u1', file: SAMPLE_FILE, action: SAMPLE_ACTION, sourcePath: '/s', destPath: '/d', timestamp: 100 }]);
    const { fetchUndoStack } = await import('../lib/api');
    const result = await fetchUndoStack();
    expect(mockAPI.getUndoStack).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });
});

describe('HTTP mode (browser / mobile)', () => {
  beforeEach(() => {
    withoutElectronAPI();
  });

  it('fetchState GET /api/state', async () => {
    const fakeResponse = { folderPath: null, files: [], history: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => fakeResponse });
    const { fetchState } = await import('../lib/api');
    const result = await fetchState();
    expect(mockFetch).toHaveBeenCalledWith('/api/state');
    expect(result).toEqual(fakeResponse);
  });

  it('setFolder POST /api/folder', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ files: [SAMPLE_FILE] }) });
    const { setFolder } = await import('../lib/api');
    const result = await setFolder('/my/folder');
    expect(mockFetch).toHaveBeenCalledWith('/api/folder', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ folderPath: '/my/folder' }),
    }));
    expect(result.files).toHaveLength(1);
  });

  it('sortFile POST /api/sort', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ remaining: 0, history: 1 }) });
    const { sortFile } = await import('../lib/api');
    const result = await sortFile('f1', SAMPLE_ACTION);
    expect(mockFetch).toHaveBeenCalledWith('/api/sort', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ fileId: 'f1', action: SAMPLE_ACTION }),
    }));
    expect(result.remaining).toBe(0);
  });

  it('undoSort POST /api/undo', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { undoSort } = await import('../lib/api');
    const result = await undoSort();
    expect(mockFetch).toHaveBeenCalledWith('/api/undo', expect.objectContaining({ method: 'POST' }));
    expect(result.ok).toBe(true);
  });

  it('fetchHistory GET /api/history', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { fetchHistory } = await import('../lib/api');
    await fetchHistory();
    expect(mockFetch).toHaveBeenCalledWith('/api/history');
  });

  it('resetServer POST /api/reset', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const { resetServer } = await import('../lib/api');
    await resetServer();
    expect(mockFetch).toHaveBeenCalledWith('/api/reset', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) });
    const { fetchState } = await import('../lib/api');
    await expect(fetchState()).rejects.toThrow('Server error: 500');
  });
});
