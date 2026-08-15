/**
 * Tests for the standalone server's pairing-token authorization.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const {
  createServer,
  authorizeRequest,
  isLoopbackAddress,
  isAllowedHost,
} = require('../server/standalone');

const TOKEN = 'a'.repeat(64);

/**
 * Start a standalone server on a random loopback port for tests.
 * Returns the server, its base URL, and a close() that also removes
 * the temp data directory.
 */
async function startTestServer(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-sorter-test-'));
  const server = createServer(path.join(__dirname, '..'), { dataDir, token: TOKEN, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    dataDir,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => server.close(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
        resolve();
      })),
  };
}

describe('isLoopbackAddress', () => {
  it('accepts IPv4 and IPv6 loopback forms', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects LAN and unknown addresses', () => {
    expect(isLoopbackAddress('192.168.1.42')).toBe(false);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe('isAllowedHost', () => {
  it('accepts loopback host names with or without a port', () => {
    expect(isAllowedHost('localhost')).toBe(true);
    expect(isAllowedHost('localhost:3456')).toBe(true);
    expect(isAllowedHost('127.0.0.1:3456')).toBe(true);
    expect(isAllowedHost('[::1]:3456')).toBe(true);
  });

  it('rejects arbitrary and rebinding-style host names', () => {
    expect(isAllowedHost('evil.example.com')).toBe(false);
    expect(isAllowedHost('evil.example.com:3456')).toBe(false);
    expect(isAllowedHost('169.254.1.1')).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });
});

describe('authorizeRequest', () => {
  it('always allows loopback requests', () => {
    expect(authorizeRequest('127.0.0.1', undefined, TOKEN)).toBe(true);
    expect(authorizeRequest('::1', 'Bearer wrong', TOKEN)).toBe(true);
  });

  it('allows remote requests with the correct Bearer token', () => {
    expect(authorizeRequest('192.168.1.42', `Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(authorizeRequest('192.168.1.42', `bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('rejects remote requests without or with a bad token', () => {
    expect(authorizeRequest('192.168.1.42', undefined, TOKEN)).toBe(false);
    expect(authorizeRequest('192.168.1.42', 'Bearer nope', TOKEN)).toBe(false);
    expect(authorizeRequest('192.168.1.42', TOKEN, TOKEN)).toBe(false);
    expect(authorizeRequest('192.168.1.42', 'Basic abc', TOKEN)).toBe(false);
  });

  it('allows everything when no token is configured (dev mode)', () => {
    expect(authorizeRequest('192.168.1.42', undefined, null)).toBe(true);
  });
});

describe('standalone server integration', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await startTestServer();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('serves /api/state to loopback without a token', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('files');
    expect(body).toHaveProperty('history');
  });

  it('rejects unknown API routes (not a crash)', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/nope`, { method: 'POST' });
    expect([404, 405]).toContain(res.status);
  });

  it('sends no CORS headers: every client is same-origin', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/state`);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('rejects API requests with a Host outside the allow-list', async () => {
    // DNS-rebinding defense: a page on evil.example.com pointed at this
    // server arrives with a Host header we never intend to serve.
    // Raw http.request is required: fetch() strips the Host header.
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: ctx.server.address().port,
          path: '/api/state',
          headers: { Host: 'evil.example.com' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it('rejects cross-origin browser requests (Origin differs from Host)', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/state`, {
      headers: { Origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('serves index.html with no-store so phones never pin to a stale bundle', async () => {
    const res = await fetch(`${ctx.baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('serves hashed /_expo/ assets as immutable', async () => {
    const jsDir = path.join(__dirname, '..', 'dist', '_expo', 'static', 'js', 'web');
    const file = fs.existsSync(jsDir)
      ? fs.readdirSync(jsDir).find((f) => f.endsWith('.js'))
      : null;
    if (!file) {
      // No web build present; a missing /_expo/ path falls back to
      // index.html, which must stay no-store.
      const res = await fetch(`${ctx.baseUrl}/_expo/static/js/web/missing.js`);
      expect(res.headers.get('cache-control')).toBe('no-store');
      return;
    }
    const res = await fetch(`${ctx.baseUrl}/_expo/static/js/web/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('applies a rotated token via setToken', async () => {
    const rotated = 'b'.repeat(64);
    ctx.server.setToken(rotated);
    expect(authorizeRequest('192.168.1.42', `Bearer ${rotated}`, rotated)).toBe(true);
    // Old token no longer valid against the server's current token
    expect(authorizeRequest('192.168.1.42', `Bearer ${TOKEN}`, rotated)).toBe(false);
  });
});

describe('per-item history undo endpoint', () => {
  let ctx;
  let sortDir;

  beforeAll(async () => {
    ctx = await startTestServer();
    sortDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-sorter-sort-'));
    fs.writeFileSync(path.join(sortDir, 'alpha.txt'), 'alpha');
    fs.writeFileSync(path.join(sortDir, 'beta.txt'), 'beta');
  });

  afterAll(async () => {
    await ctx.close();
    fs.rmSync(sortDir, { recursive: true, force: true });
  });

  const post = (urlPath, body) =>
    fetch(`${ctx.baseUrl}${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('undoes a specific history entry and re-queues the file at the top', async () => {
    // Set the folder and sort both files
    const folderRes = await post('/api/folder', { folderPath: sortDir });
    expect(folderRes.status).toBe(200);
    const { files } = await folderRes.json();
    expect(files.length).toBe(2);

    const keep = { id: 'keep', label: 'Keep', key: '1', direction: 'right', color: '#22C55E' };
    for (const file of files) {
      const sortRes = await post('/api/sort', { fileId: file.id, action: keep });
      expect(sortRes.status).toBe(200);
    }

    // Sort responses now include the undo stack length
    const historyRes = await fetch(`${ctx.baseUrl}/api/history`);
    const history = await historyRes.json();
    expect(history.length).toBe(2);

    // Undo the OLDER entry (second in the newest-first list)
    const target = history[1];
    const undoRes = await post('/api/history/undo', { historyId: target.id });
    expect(undoRes.status).toBe(200);
    const undoBody = await undoRes.json();
    expect(undoBody.ok).toBe(true);

    // The restored file is at the top of the queue with its original path
    expect(undoBody.state.files.length).toBe(1);
    expect(undoBody.state.files[0].id).toBe(target.file.id);
    expect(undoBody.state.files[0].uri).toBe(path.join(sortDir, target.file.name + '.txt'));
    // History and undo stack each dropped exactly the matching entry
    expect(undoBody.state.history.length).toBe(1);
    expect(undoBody.state.undoStack.length).toBe(1);
    // File moved back on disk
    expect(fs.existsSync(path.join(sortDir, target.file.name + '.txt'))).toBe(true);
    expect(fs.existsSync(path.join(sortDir, 'Keep', target.file.name + '.txt'))).toBe(false);
  });

  it('rejects an unknown history id', async () => {
    const res = await post('/api/history/undo', { historyId: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('requires a historyId', async () => {
    const res = await post('/api/history/undo', {});
    expect(res.status).toBe(400);
  });
});

describe('mobile access endpoints', () => {
  let ctx;
  let toggled;

  beforeAll(async () => {
    toggled = [];
    ctx = await startTestServer({
      isMobileAccessEnabled: () => true,
      onMobileAccessToggle: (enabled) => {
        toggled.push(enabled);
      },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/mobile-access reports the enabled flag', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/mobile-access`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
  });

  it('POST /api/mobile-access/enabled responds before invoking the toggle handler', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/mobile-access/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    // Handler is deferred so the response is flushed before a rebind
    expect(toggled).toEqual([]);
    await new Promise((r) => setTimeout(r, 200));
    expect(toggled).toEqual([false]);
  });

  it('rejects a non-boolean enabled value', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/mobile-access/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 501 when the host provides no toggle handler', async () => {
    const bare = await startTestServer();
    try {
      const res = await fetch(`${bare.baseUrl}/api/mobile-access/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      expect(res.status).toBe(501);
      const state = await fetch(`${bare.baseUrl}/api/mobile-access`);
      expect(await state.json()).toEqual({ enabled: false });
    } finally {
      await bare.close();
    }
  });
});
