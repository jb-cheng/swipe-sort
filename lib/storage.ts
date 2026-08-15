import AsyncStorage from '@react-native-async-storage/async-storage';
import { SortAction, HistoryRecord } from './types';
import { ThemeName, ThemeMode } from './theme';

const ACTIONS_KEY = '@sortaroo/actions';
const HISTORY_KEY = '@sortaroo/history';
const THEME_KEY = '@sortaroo/theme';
const TUTORIAL_KEY = '@sortaroo/tutorial-seen';
const PAIRING_TOKEN_KEY = '@sortaroo/pairing-token';

export const DEFAULT_ACTIONS: SortAction[] = [
  { id: 'keep', label: 'Keep', key: '1', direction: 'right', color: '#22C55E' },
  { id: 'archive', label: 'Archive', key: '2', direction: 'up', color: '#3B82F6' },
  { id: 'review', label: 'Review', key: '3', direction: 'down', color: '#F59E0B' },
  { id: 'delete', label: 'Delete', key: '4', direction: 'left', color: '#EF4444' },
];

export async function loadActions(): Promise<SortAction[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTIONS_KEY);
    if (raw) {
      return JSON.parse(raw) as SortAction[];
    }
  } catch {
    // ignore
  }
  return DEFAULT_ACTIONS;
}

export async function saveActions(actions: SortAction[]): Promise<void> {
  await AsyncStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
}

export async function loadHistory(): Promise<HistoryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as HistoryRecord[];
  } catch {
    // ignore
  }
  return [];
}

export async function addHistory(record: HistoryRecord): Promise<void> {
  const history = await loadHistory();
  history.unshift(record);
  // Keep the latest 200 records
  if (history.length > 200) history.length = 200;
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

/** Remove a single cached history record by id (after a per-item undo). */
export async function removeHistoryRecord(historyId: string): Promise<void> {
  const history = await loadHistory();
  const next = history.filter((h) => h.id !== historyId);
  if (next.length !== history.length) {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }
}

export async function loadThemePref(): Promise<{ name: ThemeName; mode: ThemeMode } | null> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export async function saveThemePref(name: ThemeName, mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, JSON.stringify({ name, mode }));
}

export async function hasSeenTutorial(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(TUTORIAL_KEY);
    return val === '1';
  } catch {
    return false;
  }
}

export async function markTutorialSeen(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_KEY, '1');
}

/** Load the stored mobile pairing token (captured from a scanned QR URL). */
export async function loadPairingToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PAIRING_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Persist the mobile pairing token. */
export async function savePairingToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PAIRING_TOKEN_KEY, token);
}
