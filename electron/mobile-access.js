/**
 * Mobile access configuration for the Electron main process.
 *
 * Owns the persisted mobile-access settings (enabled flag + pairing token)
 * and the LAN address discovery used to build the pairing URL/QR code.
 *
 * The pairing token authenticates remote (LAN) clients against the HTTP
 * server. Requests from loopback are always trusted, so the desktop window
 * itself never needs the token.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = 'mobile-access.json';
const DEFAULT_PORT = 3456;

/** Generate a cryptographically random pairing token. */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Load the mobile access config, ensuring a token always exists.
 * Returns { enabled: boolean, token: string }.
 */
function loadConfig(userDataPath) {
  let config = {};
  try {
    const configPath = path.join(userDataPath, CONFIG_FILE);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[mobile-access] Failed to load config:', err.message);
  }

  if (typeof config.token !== 'string' || config.token.length === 0) {
    config.token = generateToken();
    saveConfig(userDataPath, config);
  }
  return { enabled: config.enabled === true, token: config.token };
}

/** Persist the mobile access config. */
function saveConfig(userDataPath, config) {
  try {
    const configPath = path.join(userDataPath, CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.warn('[mobile-access] Failed to save config:', err.message);
  }
}

/**
 * Find the first non-internal IPv4 address (the machine's LAN IP).
 * Returns null when no LAN interface is available.
 */
function getLanIPv4() {
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
 * Build the full pairing URL a phone should open (token included as a
 * query parameter so the web app can store it automatically).
 */
function buildPairingUrl(host, port, token) {
  return `http://${host}:${port}/?t=${token}`;
}

module.exports = {
  DEFAULT_PORT,
  generateToken,
  loadConfig,
  saveConfig,
  getLanIPv4,
  buildPairingUrl,
};
