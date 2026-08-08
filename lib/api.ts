import { FileItem, HistoryRecord, SortAction, UndoRecord } from './types';

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

interface PreviewResponse {
  type: 'image' | 'text';
  contentType: string;
  base64?: string;
  text?: string;
}

interface NativeIconResponse {
  type: 'image';
  dataUrl: string;
}

// ── Environment detection ─────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';
}

function getElectronAPI() {
  const api = (window as any)?.electronAPI;
  if (!api) throw new Error('Not running in Electron');
  return api as {
    getState(): Promise<StateResponse>;
    setFolder(folderPath: string): Promise<{ files: FileItem[] }>;
    sortFile(fileId: string, action: SortAction): Promise<SortResponse>;
    undoSort(): Promise<UndoResponse>;
    getHistory(): Promise<HistoryRecord[]>;
    clearHistory(): Promise<void>;
    getUndoStack(): Promise<UndoRecord[]>;
    resetState(): Promise<{ ok: boolean }>;
    pickFolder(): Promise<string | null>;
    getFilePreview(fileId: string): Promise<PreviewResponse>;
    getNativeIcon(filePath: string): Promise<NativeIconResponse | null>;
    pregeneratePreviews(count?: number): Promise<{ ok: boolean }>;
    setAlwaysOnTop(enabled: boolean): Promise<{ ok: boolean }>;
    getAlwaysOnTop(): Promise<{ enabled: boolean }>;
    openFile(filePath: string): Promise<void>;
    revealInFolder(filePath: string): Promise<void>;
    onServerPort(callback: (port: number | null) => void): void;
  };
}

// ── API functions ─────────────────────────────────────────────────

/** Fetch the current state (folder, file queue, history, undo stack). */
export async function fetchState(): Promise<StateResponse> {
  if (isElectron()) {
    return getElectronAPI().getState();
  }
  const res = await fetch(`${BASE}/api/state`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

/** Set the folder path — server scans it and returns shuffled files. */
export async function setFolder(folderPath: string): Promise<{ files: FileItem[] }> {
  if (isElectron()) {
    return getElectronAPI().setFolder(folderPath);
  }
  const res = await fetch(`${BASE}/api/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  return res.json();
}

/** Sort a file (move to action-named subfolder). */
export async function sortFile(
  fileId: string,
  action: SortAction,
): Promise<SortResponse> {
  if (isElectron()) {
    return getElectronAPI().sortFile(fileId, action);
  }
  const res = await fetch(`${BASE}/api/sort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  return res.json();
}

/** Undo the last sort operation. */
export async function undoSort(): Promise<UndoResponse> {
  if (isElectron()) {
    return getElectronAPI().undoSort();
  }
  const res = await fetch(`${BASE}/api/undo`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  return res.json();
}

/** Fetch sort history. */
export async function fetchHistory(): Promise<HistoryRecord[]> {
  if (isElectron()) {
    return getElectronAPI().getHistory();
  }
  const res = await fetch(`${BASE}/api/history`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

/** Clear server-side history (keeps folder, queue, and undo stack). */
export async function clearServerHistory(): Promise<void> {
  if (isElectron()) {
    await getElectronAPI().clearHistory();
    return;
  }
  await fetch(`${BASE}/api/clear-history`, { method: 'POST' });
}

/** Fetch undo stack. */
export async function fetchUndoStack(): Promise<UndoRecord[]> {
  if (isElectron()) {
    return getElectronAPI().getUndoStack();
  }
  const res = await fetch(`${BASE}/api/undo-stack`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

/** Reset server state (clear folder, files, history, undo). */
export async function resetServer(): Promise<void> {
  if (isElectron()) {
    await getElectronAPI().resetState();
    return;
  }
  await fetch(`${BASE}/api/reset`, { method: 'POST' });
}

/**
 * Fetch a file preview (image or text).
 * Returns a data URL for images or plain text for text files.
 */
export async function getFilePreview(fileId: string): Promise<string | null> {
  if (isElectron()) {
    try {
      const result = await getElectronAPI().getFilePreview(fileId);
      if (result.type === 'image' && result.base64) {
        return `data:${result.contentType};base64,${result.base64}`;
      }
      if (result.type === 'text' && result.text) {
        return result.text;
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch(`${BASE}/api/preview/${encodeURIComponent(fileId)}`);
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
 * Pre-generate previews for the next N files in the queue (lazy loading).
 */
export async function pregeneratePreviews(count: number = 5): Promise<void> {
  if (isElectron()) {
    try {
      await getElectronAPI().pregeneratePreviews(count);
    } catch {
      // best-effort
    }
    return;
  }
  try {
    await fetch(`${BASE}/api/previews/pregenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
  } catch {
    // best-effort
  }
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
