import { FileItem, HistoryRecord, MobileAccessInfo, SortAction, UndoRecord } from './types';
import { loadPairingToken, savePairingToken } from './storage';

const BASE = '';

// ── Types for server responses ────────────────────────────────────

interface StateResponse {
  folderPath: string | null;
  files: FileItem[];
  history: HistoryRecord[];
  undoStack?: UndoRecord[];
}

interface SortResponse {
  remaining: number;
  history?: number;
  undoStackLength: number;
}

interface UndoResponse {
  ok: boolean;
  state?: StateResponse;
}

// ── Environment detection ─────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';
}

function getElectronAPI() {
  const api = (window as any)?.electronAPI;
  if (!api) throw new Error('Not running in Electron');
  return api as {
    pickFolder(): Promise<string | null>;
    getNativeIcon(filePath: string): Promise<{ type: 'image'; dataUrl: string } | null>;
    setAlwaysOnTop(enabled: boolean): Promise<{ ok: boolean }>;
    getAlwaysOnTop(): Promise<{ enabled: boolean }>;
    openFile(filePath: string): Promise<void>;
    revealInFolder(filePath: string): Promise<void>;
    getMobileAccess(): Promise<MobileAccessInfo>;
    setMobileAccessEnabled(enabled: boolean): Promise<MobileAccessInfo>;
    resetMobileToken(): Promise<MobileAccessInfo>;
    onMobileAccessChanged(callback: (info: MobileAccessInfo) => void): void;
  };
}

// ── Pairing token ─────────────────────────────────────────────────
//
// Phones reach the server by scanning a QR code whose URL carries the
// pairing token as ?t=<token>. On first load we capture it, persist it,
// and strip it from the address bar. Every subsequent API request sends
// it as a Bearer token. The desktop window connects over loopback, which
// the server trusts unconditionally, so it never needs the token.

let tokenPromise: Promise<string | null> | null = null;

function getToken(): Promise<string | null> {
  if (!tokenPromise) {
    tokenPromise = loadPairingToken().catch(() => null);
  }
  return tokenPromise;
}

/**
 * Capture the pairing token from the current URL (?t=...), persist it,
 * and clean the address bar. Safe to call multiple times; runs only in
 * browser environments.
 */
export function capturePairingToken(): void {
  if (typeof window === 'undefined') return;
  const location = (window as any).location;
  if (!location || typeof location.search !== 'string') return;

  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  if (!token) return;

  params.delete('t');
  const remaining = params.toString();
  const cleanUrl =
    location.pathname + (remaining ? `?${remaining}` : '') + (location.hash || '');
  if (typeof (window as any).history?.replaceState === 'function') {
    (window as any).history.replaceState(null, '', cleanUrl);
  }

  // Reset the memoized loader so the freshly scanned token is used.
  tokenPromise = Promise.resolve(token);
  savePairingToken(token).catch(() => {
    // Storage failure is non-fatal; the in-memory token still works
    // for this session.
  });
}

// Run capture as early as possible on module load (browser only).
capturePairingToken();

// ── HTTP transport ────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  return res.json();
}

// ── API functions (HTTP: shared by desktop window and phones) ─────

/** Fetch the current state (folder, file queue, history, undo stack). */
export async function fetchState(): Promise<StateResponse> {
  return apiGet('/api/state');
}

/** Set the folder path — server scans it and returns shuffled files. */
export async function setFolder(folderPath: string): Promise<{ files: FileItem[] }> {
  return apiPost('/api/folder', { folderPath });
}

/** Sort a file (move to action-named subfolder). */
export async function sortFile(
  fileId: string,
  action: SortAction,
): Promise<SortResponse> {
  return apiPost('/api/sort', { fileId, action });
}

/** Undo the last sort operation. */
export async function undoSort(): Promise<UndoResponse> {
  return apiPost('/api/undo');
}

/** Fetch sort history. */
export async function fetchHistory(): Promise<HistoryRecord[]> {
  return apiGet('/api/history');
}

/** Clear server-side history (keeps folder, queue, and undo stack). */
export async function clearServerHistory(): Promise<void> {
  await apiPost('/api/clear-history');
}

/** Fetch undo stack. */
export async function fetchUndoStack(): Promise<UndoRecord[]> {
  return apiGet('/api/undo-stack');
}

/** Reset server state (clear folder, files, history, undo). */
export async function resetServer(): Promise<void> {
  await apiPost('/api/reset');
}

/**
 * Fetch a file preview (image or text).
 * Returns a data URL for images or plain text for text files.
 */
export async function getFilePreview(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/preview/${encodeURIComponent(fileId)}`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.startsWith('image/')) {
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    // text
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Pre-generate previews for the next N files in the queue (lazy loading).
 */
export async function pregeneratePreviews(count: number = 5): Promise<void> {
  try {
    await apiPost('/api/previews/pregenerate', { count });
  } catch {
    // best-effort
  }
}

// ── Native capabilities (Electron only) ───────────────────────────

/**
 * Fetch the OS-native file icon (Tier 2 preview — Electron only).
 * Returns a data URL for the icon image, or null.
 */
export async function getNativeIcon(fileUri: string): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    const result = await getElectronAPI().getNativeIcon(fileUri);
    if (result && result.type === 'image' && result.dataUrl) {
      return result.dataUrl;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set the Electron window's always-on-top state (desktop only).
 */
export async function setAlwaysOnTop(enabled: boolean): Promise<void> {
  if (!isElectron()) return;
  try {
    await getElectronAPI().setAlwaysOnTop(enabled);
  } catch {
    // ignore
  }
}

/**
 * Get the current always-on-top state (desktop only).
 */
export async function getAlwaysOnTop(): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const result = await getElectronAPI().getAlwaysOnTop();
    return result.enabled;
  } catch {
    return false;
  }
}

/**
 * Open a file with the OS default application (Electron only).
 */
export async function openFile(filePath: string): Promise<void> {
  if (!isElectron() || !filePath) return;
  try {
    await getElectronAPI().openFile(filePath);
  } catch {
    // ignore
  }
}

/**
 * Reveal a file in the OS file explorer (Electron only).
 */
export async function revealInFolder(filePath: string): Promise<void> {
  if (!isElectron() || !filePath) return;
  try {
    await getElectronAPI().revealInFolder(filePath);
  } catch {
    // ignore
  }
}

// ── Mobile access controls (Electron only) ────────────────────────

/** Current mobile access status (enabled, port, pairing URL, token). */
export async function getMobileAccess(): Promise<MobileAccessInfo | null> {
  if (!isElectron()) return null;
  try {
    return await getElectronAPI().getMobileAccess();
  } catch {
    return null;
  }
}

/** Enable or disable LAN access for phones. */
export async function setMobileAccessEnabled(enabled: boolean): Promise<MobileAccessInfo | null> {
  if (!isElectron()) return null;
  try {
    return await getElectronAPI().setMobileAccessEnabled(enabled);
  } catch {
    return null;
  }
}

/** Rotate the pairing token; previously paired phones must re-scan. */
export async function resetMobileToken(): Promise<MobileAccessInfo | null> {
  if (!isElectron()) return null;
  try {
    return await getElectronAPI().resetMobileToken();
  } catch {
    return null;
  }
}

/** Subscribe to mobile access status changes (desktop only). */
export function onMobileAccessChanged(callback: (info: MobileAccessInfo) => void): void {
  if (!isElectron()) return;
  try {
    getElectronAPI().onMobileAccessChanged(callback);
  } catch {
    // ignore
  }
}
