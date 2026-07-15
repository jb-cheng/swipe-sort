import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  useColorScheme,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SortAction, SwipeDirection } from '../lib/types';
import { loadActions, saveActions, DEFAULT_ACTIONS } from '../lib/storage';
import { setAlwaysOnTop, getAlwaysOnTop } from '../lib/api';

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

const MAX_ACTIONS = 8;

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [actions, setActions] = useState<SortAction[]>([]);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);
  const listRef = useRef<FlatList<SortAction>>(null);
  const isElectron = typeof (window as any).electronAPI !== 'undefined';

  useEffect(() => {
    loadActions().then(setActions);
    // Load always-on-top setting if in Electron
    if (isElectron) {
      getAlwaysOnTop().then(setAlwaysOnTopState).catch(() => {});
    }
  }, []);

  const updateAction = (id: string, patch: Partial<SortAction>) => {
    const next = actions.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setActions(next);
    saveActions(next);
  };

  const addAction = () => {
    // Find next unused key from '1' to '9'
    const usedKeys = new Set(actions.map((a) => a.key));
    let nextKey = '1';
    for (let i = 1; i <= 9; i++) {
      const k = String(i);
      if (!usedKeys.has(k)) {
        nextKey = k;
        break;
      }
    }

    // Find first unused color from PALETTE
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
    // Scroll to the new action so the user sees it was added
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
      // window.confirm is more reliable on web than Alert.alert with custom buttons
      if (window.confirm('Reset actions? This will restore the default hotkeys and swipe directions.')) {
        doReset();
      }
      return;
    }

    Alert.alert('Reset actions?', 'This will restore the default hotkeys and swipe directions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: doReset,
      },
    ]);
  };

  const handleToggleAlwaysOnTop = (value: boolean) => {
    setAlwaysOnTopState(value);
    setAlwaysOnTop(value).catch(() => {});
  };

  const renderFooter = () => {
    if (!isElectron) return null;
    return (
      <View
        style={[
          styles.footerCard,
          {
            backgroundColor: isDark ? '#1e293b' : '#fff',
          },
        ]}
      >
        <View style={styles.footerRow}>
          <View style={styles.footerInfo}>
            <Text style={[styles.footerTitle, { color: isDark ? '#fff' : '#0f172a' }]}>
              Stay on top
            </Text>
            <Text style={[styles.footerSubtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Keep window above all others
            </Text>
          </View>
          <Switch
            value={alwaysOnTop}
            onValueChange={handleToggleAlwaysOnTop}
            trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: '#3B82F6' }}
            thumbColor="#fff"
          />
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: SortAction }) => {
    // Directions assigned to other actions (excluding 'none', which is safe to share)
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
      <View
        style={[
        styles.card,
        {
          position: 'relative',
          backgroundColor: isDark ? '#1e293b' : '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 3,
        },
      ]}
    >
      {actions.length > 1 && (
        <Pressable
          onPress={() => deleteAction(item.id)}
          style={styles.deleteButton}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </Pressable>
      )}
      <View style={styles.row}>
        <View style={[styles.colorStrip, { backgroundColor: item.color }]} />
        <View style={styles.fields}>
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: isDark ? '#94a3b8' : '#64748b' }]}>Label</Text>
              <TextInput
                value={item.label}
                onChangeText={(text) => updateAction(item.id, { label: text })}
                style={[
                  styles.input,
                  {
                    color: isDark ? '#fff' : '#0f172a',
                    backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  },
                ]}
                maxLength={18}
              />
            </View>
            <View style={[styles.field, { width: 80 }]}>
              <Text style={[styles.label, { color: isDark ? '#94a3b8' : '#64748b' }]}>Key</Text>
              <TextInput
                value={item.key}
                onChangeText={(text) => updateAction(item.id, { key: text.slice(-1) })}
                style={[
                  styles.input,
                  styles.keyInput,
                  {
                    color: isDark ? '#fff' : '#0f172a',
                    backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  },
                ]}
                maxLength={1}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? '#94a3b8' : '#64748b' }]}>Swipe</Text>
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
                          item.direction === dir
                            ? item.color
                            : isDark
                            ? '#0f172a'
                            : '#f1f5f9',
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
                          : isDark
                          ? '#94a3b8'
                          : '#64748b'
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
            {hasConflict && conflictLabel && (
              <Text style={styles.conflictWarning}>
                ⚠️ "{conflictLabel}" already uses this swipe direction — only the first
                match will trigger
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? '#94a3b8' : '#64748b' }]}>Color</Text>
            <View style={styles.palette}>
              {PALETTE.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => updateAction(item.id, { color })}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    item.color === color && styles.swatchActive,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}
      edges={['top']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>Actions</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            Customize hotkeys, colors, and swipe directions
          </Text>
        </View>
        <View style={styles.headerActions}>
          {actions.length < MAX_ACTIONS && (
            <Pressable onPress={addAction} style={styles.addButton}>
              <Ionicons name="add" size={18} color="#3B82F6" />
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          )}
          <Pressable onPress={resetDefaults} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={actions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  resetButton: {
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resetText: {
    color: '#3B82F6',
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
  },
  row: {
    flexDirection: 'row',
  },
  colorStrip: {
    width: 6,
    borderRadius: 3,
    marginRight: 14,
  },
  fields: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
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
    marginTop: 14,
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
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  conflictWarning: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 18,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 14,
  },
  footerCard: {
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerInfo: {
    flex: 1,
    marginRight: 16,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  footerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
});
