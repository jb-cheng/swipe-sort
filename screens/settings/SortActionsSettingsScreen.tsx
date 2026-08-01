import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SortAction, SwipeDirection } from '../../lib/types';
import { loadActions, saveActions, DEFAULT_ACTIONS } from '../../lib/storage';
import { useTheme } from '../../lib/ThemeContext';

const PALETTE = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#64748B',
];

const DIRECTIONS: SwipeDirection[] = ['left', 'right', 'up', 'down', 'none'];
const DIRECTION_ICON: Record<SwipeDirection, string> = {
  left: 'arrow-back',
  right: 'arrow-forward',
  up: 'arrow-up',
  down: 'arrow-down',
  none: 'close',
};
const DIRECTION_ARROW: Record<SwipeDirection, string> = {
  left: '\u2190',
  right: '\u2192',
  up: '\u2191',
  down: '\u2193',
  none: '',
};

const MAX_ACTIONS = 8;

export default function SortActionsSettingsScreen() {
  const { colors } = useTheme();
  const [actions, setActions] = useState<SortAction[]>([]);
  const listRef = useRef<FlatList<SortAction>>(null);

  useEffect(() => {
    loadActions().then(setActions);
  }, []);

  const updateAction = (id: string, patch: Partial<SortAction>) => {
    const next = actions.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setActions(next);
    saveActions(next);
  };

  const addAction = () => {
    const usedKeys = new Set(actions.map((a) => a.key));
    let nextKey = '1';
    for (let i = 1; i <= 9; i++) {
      const k = String(i);
      if (!usedKeys.has(k)) {
        nextKey = k;
        break;
      }
    }

    const usedColors = new Set(actions.map((a) => a.color));
    const nextColor = PALETTE.find((c) => !usedColors.has(c)) || '#64748B';

    const newAction: SortAction = {
      id: `custom-${Date.now()}`,
      label: 'New Action',
      key: nextKey,
      direction: 'none',
      color: nextColor,
    };

    const next = [...actions, newAction];
    setActions(next);
    saveActions(next);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const deleteAction = (id: string) => {
    if (actions.length <= 1) return;
    const next = actions.filter((a) => a.id !== id);
    setActions(next);
    saveActions(next);
  };

  const resetDefaults = () => {
    const doReset = () => {
      setActions([...DEFAULT_ACTIONS]);
      saveActions([...DEFAULT_ACTIONS]);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Reset actions? This will restore the default hotkeys and swipe directions.')) {
        doReset();
      }
      return;
    }

    Alert.alert('Reset actions?', 'This will restore the default hotkeys and swipe directions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: doReset },
    ]);
  };

  const renderItem = ({ item }: { item: SortAction }) => {
    const takenDirections = new Set<SwipeDirection>();
    for (const other of actions) {
      if (other.id !== item.id && other.direction !== 'none') {
        takenDirections.add(other.direction);
      }
    }
    const hasConflict = item.direction !== 'none' && takenDirections.has(item.direction);
    const conflictLabel = hasConflict
      ? [...actions].find((a) => a.id !== item.id && a.direction === item.direction)?.label
      : null;

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {actions.length > 1 && (
          <Pressable
            onPress={() => deleteAction(item.id)}
            style={[styles.deleteButton, { backgroundColor: 'rgba(239,68,68,0.12)' }]}
            hitSlop={10}
          >
            <Ionicons name="trash" size={18} color="#ef4444" />
          </Pressable>
        )}

        <View style={[styles.previewRow, { borderBottomColor: colors.border }]}>
          <View style={[styles.previewChip, { backgroundColor: item.color }]}>
            <View style={styles.previewKeyBadge}>
              <Text style={styles.previewKeyText}>{item.key.toUpperCase()}</Text>
            </View>
            <Text style={styles.previewLabel}>{item.label || 'Action'}</Text>
            {item.direction !== 'none' && (
              <Text style={styles.previewArrow}>{DIRECTION_ARROW[item.direction]}</Text>
            )}
          </View>
          <Text style={[styles.previewHint, { color: colors.textMuted }]}>Button preview</Text>
        </View>

        <View>
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Label</Text>
              <TextInput
                value={item.label}
                onChangeText={(text) => updateAction(item.id, { label: text })}
                style={[
                  styles.input,
                  { color: colors.text, backgroundColor: colors.surfaceHover },
                ]}
                maxLength={18}
              />
            </View>
            <View style={[styles.field, { width: 80 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Hotkey</Text>
              <TextInput
                value={item.key}
                onChangeText={(text) => updateAction(item.id, { key: text.slice(-1) })}
                style={[
                  styles.input,
                  styles.keyInput,
                  { color: colors.text, backgroundColor: colors.surfaceHover },
                ]}
                maxLength={1}
                autoCapitalize="none"
              />
            </View>
          </View>
          <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
            Press this key on your keyboard to trigger the action
          </Text>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Swipe direction to trigger
            </Text>
            <View style={styles.directions}>
              {DIRECTIONS.map((dir) => {
                const isTaken = dir !== 'none' && takenDirections.has(dir) && item.direction !== dir;
                return (
                  <Pressable
                    key={dir}
                    onPress={() => updateAction(item.id, { direction: dir })}
                    style={[
                      styles.dirButton,
                      {
                        backgroundColor:
                          item.direction === dir ? item.color : colors.surfaceHover,
                        opacity: isTaken ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={DIRECTION_ICON[dir] as any}
                      size={18}
                      color={
                        item.direction === dir
                          ? '#fff'
                          : isTaken
                          ? '#ef4444'
                          : colors.textSecondary
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
            {hasConflict && conflictLabel && (
              <Text style={styles.conflictWarning}>
                "{conflictLabel}" already uses this direction. Only the first match will trigger.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Color</Text>
            <View style={styles.palette}>
              {PALETTE.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => updateAction(item.id, { color })}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    item.color === color && [styles.swatchActive, { borderColor: colors.accent }],
                  ]}
                >
                  {item.color === color && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <View style={styles.toolbar}>
        {actions.length < MAX_ACTIONS && (
          <Pressable onPress={addAction} style={[styles.addButton, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={[styles.addText, { color: colors.accent }]}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={resetDefaults} style={[styles.resetButton, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.resetText, { color: colors.accent }]}>Reset</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={actions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addText: {
    fontWeight: '700',
    fontSize: 14,
  },
  resetButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resetText: {
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    position: 'relative',
    borderWidth: 1,
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewRow: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 76,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  previewKeyBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  previewKeyText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  previewLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  previewArrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  previewHint: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 0.3,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
  },
  fieldHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  keyInput: {
    textAlign: 'center',
    fontWeight: '800',
  },
  section: {
    marginTop: 16,
  },
  directions: {
    flexDirection: 'row',
    gap: 10,
  },
  dirButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchActive: {
    transform: [{ scale: 1.15 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  conflictWarning: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 18,
  },
});
