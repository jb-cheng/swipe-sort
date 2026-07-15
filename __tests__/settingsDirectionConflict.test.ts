/**
 * Tests for direction conflict detection logic in SettingsScreen.
 *
 * The SettingsScreen's renderItem computes takenDirections and hasConflict
 * using this algorithm:
 *   - Collect directions of all other actions (excluding 'none')
 *   - If the current action's non-'none' direction is taken → conflict
 *
 * These tests validate that logic directly.
 */
import { SortAction, SwipeDirection } from '../lib/types';

// ── Helper that mirrors the exact logic in SettingsScreen.renderItem ──

function getTakenDirections(
  actions: SortAction[],
  currentId: string,
): Set<SwipeDirection> {
  const taken = new Set<SwipeDirection>();
  for (const other of actions) {
    if (other.id !== currentId && other.direction !== 'none') {
      taken.add(other.direction);
    }
  }
  return taken;
}

function hasConflict(actions: SortAction[], currentId: string): boolean {
  const current = actions.find((a) => a.id === currentId);
  if (!current || current.direction === 'none') return false;
  const taken = getTakenDirections(actions, currentId);
  return taken.has(current.direction);
}

function getConflictingActionLabel(
  actions: SortAction[],
  currentId: string,
): string | null {
  const current = actions.find((a) => a.id === currentId);
  if (!current || current.direction === 'none') return null;
  const taken = getTakenDirections(actions, currentId);
  if (!taken.has(current.direction)) return null;
  const conflicting = actions.find(
    (a) => a.id !== currentId && a.direction === current.direction,
  );
  return conflicting?.label ?? null;
}

// ── Fixtures ───────────────────────────────────────────────────────

const keep: SortAction = { id: 'keep', label: 'Keep', key: '1', direction: 'right', color: '#22C55E' };
const archive: SortAction = { id: 'archive', label: 'Archive', key: '2', direction: 'up', color: '#3B82F6' };
const review: SortAction = { id: 'review', label: 'Review', key: '3', direction: 'down', color: '#F59E0B' };
const deleteAction: SortAction = { id: 'delete', label: 'Delete', key: '4', direction: 'left', color: '#EF4444' };
const extra: SortAction = { id: 'extra', label: 'Extra', key: '5', direction: 'none', color: '#64748B' };

// ── Tests ──────────────────────────────────────────────────────────

describe('direction conflict detection', () => {
  it('no conflict when all directions are distinct', () => {
    const actions = [keep, archive, review, deleteAction];
    for (const a of actions) {
      expect(hasConflict(actions, a.id)).toBe(false);
    }
  });

  it('detects conflict when two actions share a swipe direction', () => {
    const clash = { ...review, direction: 'right' as SwipeDirection };
    const actions = [keep, archive, clash];

    // 'keep' and 'clash' both have direction: 'right'
    expect(hasConflict(actions, 'keep')).toBe(true);
    expect(hasConflict(actions, clash.id)).toBe(true);
    // 'archive' has its own direction
    expect(hasConflict(actions, 'archive')).toBe(false);

    // Check that the conflicting label is correct
    expect(getConflictingActionLabel(actions, 'keep')).toBe('Review');
    expect(getConflictingActionLabel(actions, clash.id)).toBe('Keep');
  });

  it('no conflict when one action uses "none" direction', () => {
    const actions = [keep, extra];
    expect(hasConflict(actions, 'keep')).toBe(false);
    expect(hasConflict(actions, 'extra')).toBe(false);
  });

  it('excludes "none" from taken directions', () => {
    // Two actions with direction:'none' — should NOT be a conflict
    const extra2: SortAction = { id: 'extra2', label: 'Extra2', key: '6', direction: 'none', color: '#111' };
    const actions = [extra, extra2];
    expect(hasConflict(actions, 'extra')).toBe(false);
    expect(hasConflict(actions, 'extra2')).toBe(false);
  });

  it('multiple conflicts are detected', () => {
    // Three actions: all point to 'right'
    const a1: SortAction = { id: 'a1', label: 'Alpha', key: '1', direction: 'right', color: '#111' };
    const a2: SortAction = { id: 'a2', label: 'Beta', key: '2', direction: 'right', color: '#222' };
    const a3: SortAction = { id: 'a3', label: 'Gamma', key: '3', direction: 'right', color: '#333' };
    const actions = [a1, a2, a3];
    for (const a of actions) {
      expect(hasConflict(actions, a.id)).toBe(true);
    }
  });

  it('single action has no conflict', () => {
    expect(hasConflict([keep], 'keep')).toBe(false);
    expect(hasConflict([extra], 'extra')).toBe(false);
  });
});
