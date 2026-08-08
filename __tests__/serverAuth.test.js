/**
 * Tests for the standalone server's pairing-token authorization.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createServer, authorizeRequest, isLoopbackAddress } = require('../server/standalone');

const TOKEN = 'a'.repeat(64);

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
  let server;
  let baseUrl;
  let dataDir;

  beforeAll((done) => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-sorter-test-'));
    server = createServer(path.join(__dirname, '..'), { dataDir, token: TOKEN });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      fs.rmSync(dataDir, { recursive: true, force: true });
      done();
    });
  });

  it('serves /api/state to loopback without a token', async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('files');
    expect(body).toHaveProperty('history');
  });

  it('rejects unknown API routes (not a crash)', async () => {
    const res = await fetch(`${baseUrl}/api/nope`, { method: 'POST' });
    expect([404, 405]).toContain(res.status);
  });

  it('applies a rotated token via setToken', async () => {
    const rotated = 'b'.repeat(64);
    server.setToken(rotated);
    expect(authorizeRequest('192.168.1.42', `Bearer ${rotated}`, rotated)).toBe(true);
    // Old token no longer valid against the server's current token
    expect(authorizeRequest('192.168.1.42', `Bearer ${TOKEN}`, rotated)).toBe(false);
  });
});
