/**
 * Tests for lib/api.ts
 *
 * All app state flows over HTTP (desktop window and phones alike), so the
 * suite covers the fetch transport, pairing-token capture from the QR URL,
 * and Bearer header injection. Native (Electron-only) helpers are verified
 * to no-op gracefully outside Electron.
 */

// ── AsyncStorage mock ─────────────────────────────────────────────
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStore[key];
  }),
}));

// ── Fetch mock ────────────────────────────────────────────────────
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as any;

const SAMPLE_FILE = { id: 'f1', name: 'test', extension: 'txt', type: 'doc', size: '1 KB', date: '2025-01-01', uri: '/path/test.txt' };
const SAMPLE_ACTION = { id: 'keep', label: 'Keep', key: '1', direction: 'right' as const, color: '#22C55E' };

function plainWindow() {
  (globalThis as any).window = undefined;
}

beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  plainWindow();
});

describe('HTTP transport', () => {
  it('fetchState GET /api/state', async () => {
    const fakeResponse = { folderPath: null, files: [], history: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => fakeResponse });
    const { fetchState } = await import('../lib/api');
    const result = await fetchState();
    expect(mockFetch).toHaveBeenCalledWith('/api/state', expect.any(Object));
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
    expect(mockFetch).toHaveBeenCalledWith('/api/history', expect.any(Object));
  });

  it('resetServer POST /api/reset', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { resetServer } = await import('../lib/api');
    await resetServer();
    expect(mockFetch).toHaveBeenCalledWith('/api/reset', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) });
    const { fetchState } = await import('../lib/api');
    await expect(fetchState()).rejects.toThrow('Server error: 500');
  });

  it('sends no Authorization header when no token is stored', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { resetServer } = await import('../lib/api');
    await resetServer();
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});

describe('Pairing token', () => {
  it('attaches stored token as Bearer header', async () => {
    mockStore['@sortaroo/pairing-token'] = 'stored-secret';
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ folderPath: null, files: [], history: [] }) });
    const { fetchState } = await import('../lib/api');
    await fetchState();
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer stored-secret' });
  });

  it('captures token from ?t= URL param, persists it, and cleans the URL', async () => {
    const replaceState = jest.fn();
    (globalThis as any).window = {
      location: { search: '?t=qr-secret', pathname: '/', hash: '' },
      history: { replaceState },
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ folderPath: null, files: [], history: [] }) });

    const { fetchState } = await import('../lib/api');
    await fetchState();

    // Token persisted for future sessions
    expect(mockStore['@sortaroo/pairing-token']).toBe('qr-secret');
    // Address bar cleaned
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    // Request authenticated
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer qr-secret' });
  });
});

describe('Native helpers outside Electron', () => {
  it('getMobileAccess returns null', async () => {
    const { getMobileAccess } = await import('../lib/api');
    await expect(getMobileAccess()).resolves.toBeNull();
  });

  it('getNativeIcon returns null', async () => {
    const { getNativeIcon } = await import('../lib/api');
    await expect(getNativeIcon('/some/file')).resolves.toBeNull();
  });

  it('openFile is a no-op', async () => {
    const { openFile } = await import('../lib/api');
    await expect(openFile('/some/file')).resolves.toBeUndefined();
  });
});
