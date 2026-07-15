import AsyncStorage from '@react-native-async-storage/async-storage';
import { SortAction, HistoryRecord } from './types';

const ACTIONS_KEY = '@sortaroo/actions';
const HISTORY_KEY = '@sortaroo/history';

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
