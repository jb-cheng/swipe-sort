/**
 * Tests for lib/storage.ts
 * AsyncStorage is mocked automatically by jest.
 */
import {
  loadActions,
  saveActions,
  DEFAULT_ACTIONS,
  loadHistory,
  addHistory,
  clearHistory,
} from '../lib/storage';
import { SortAction, HistoryRecord } from '../lib/types';

// Mock AsyncStorage
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

beforeEach(() => {
  Object.keys(mockStore).forEach(key => delete mockStore[key]);
});

describe('loadActions', () => {
  it('returns default actions when nothing is stored', async () => {
    const actions = await loadActions();
    expect(actions).toEqual(DEFAULT_ACTIONS);
  });

  it('returns stored actions when length matches', async () => {
    const custom: SortAction[] = [
      { id: 'custom1', label: 'Custom1', key: 'q', direction: 'left', color: '#FF0000' },
      { id: 'custom2', label: 'Custom2', key: 'w', direction: 'right', color: '#00FF00' },
      { id: 'custom3', label: 'Custom3', key: 'e', direction: 'up', color: '#0000FF' },
      { id: 'custom4', label: 'Custom4', key: 'r', direction: 'down', color: '#FFFF00' },
    ];
    await saveActions(custom);
    const loaded = await loadActions();
    expect(loaded).toEqual(custom);
  });

  it('returns stored actions regardless of length (length guard removed)', async () => {
    const custom: SortAction[] = [
      { id: 'only-one', label: 'Solo', key: '1', direction: 'left', color: '#000' },
    ];
    await saveActions(custom);
    const loaded = await loadActions();
    expect(loaded).toEqual(custom);
  });

  it('falls back to defaults on JSON parse error', async () => {
    mockStore['@sortaroo/actions'] = 'not valid json';
    const actions = await loadActions();
    expect(actions).toEqual(DEFAULT_ACTIONS);
  });
});

describe('saveActions', () => {
  it('persists actions to storage', async () => {
    const custom: SortAction[] = [
      { id: 'a', label: 'Alpha', key: '1', direction: 'right', color: '#111' },
      { id: 'b', label: 'Beta', key: '2', direction: 'left', color: '#222' },
      { id: 'c', label: 'Gamma', key: '3', direction: 'up', color: '#333' },
      { id: 'd', label: 'Delta', key: '4', direction: 'down', color: '#444' },
    ];
    await saveActions(custom);
    const raw = mockStore['@sortaroo/actions'];
    expect(raw).toBe(JSON.stringify(custom));
  });
});

describe('history functions', () => {
  const sampleFile = { id: 'f1', name: 'test', extension: 'txt', type: 'doc' as const, size: '1 KB', date: '2025-01-01' };
  const sampleAction: SortAction = { id: 'keep', label: 'Keep', key: '1', direction: 'right', color: '#22C55E' };

  it('loadHistory returns empty array when nothing stored', async () => {
    const history = await loadHistory();
    expect(history).toEqual([]);
  });

  it('addHistory adds record to front', async () => {
    const record1: HistoryRecord = { id: 'h1', file: sampleFile, action: sampleAction, timestamp: 100 };
    const record2: HistoryRecord = { id: 'h2', file: sampleFile, action: sampleAction, timestamp: 200 };

    await addHistory(record1);
    await addHistory(record2);

    const history = await loadHistory();
    expect(history.length).toBe(2);
    expect(history[0].id).toBe('h2'); // newest first
    expect(history[1].id).toBe('h1');
  });

  it('clearHistory removes all history', async () => {
    const record: HistoryRecord = { id: 'h1', file: sampleFile, action: sampleAction, timestamp: 100 };
    await addHistory(record);
    await clearHistory();

    const history = await loadHistory();
    expect(history).toEqual([]);
  });

  it('caps history at 200 records', async () => {
    for (let i = 0; i < 250; i++) {
      await addHistory({ id: `h${i}`, file: sampleFile, action: sampleAction, timestamp: i });
    }
    const history = await loadHistory();
    expect(history.length).toBe(200);
  });
});
