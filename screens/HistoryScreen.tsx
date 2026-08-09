import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HistoryRecord } from '../lib/types';
import { loadHistory, clearHistory, removeHistoryRecord } from '../lib/storage';
import { fetchHistory, clearServerHistory, revealInFolder, undoHistoryItem } from '../lib/api';
import { sortedDestinationPath } from '../lib/fileHelpers';
import { useTheme } from '../lib/ThemeContext';
import FileIcon from '../components/FileIcon';
import EmptyIllustration from '../components/EmptyIllustration';
import TutorialTarget from '../components/TutorialTarget';

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryScreen() {
  const { colors, isDark } = useTheme();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistoryData();
      return () => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }, [])
  );

  const loadHistoryData = async () => {
    // Try server first (covers both IPC and HTTP modes)
    try {
      const serverHistory = await fetchHistory();
      if (serverHistory.length > 0) {
        setHistory(serverHistory);
        return;
      }
    } catch {
      // server unreachable, fall back to local
    }
    // Fallback: load from AsyncStorage
    const local = await loadHistory();
    setHistory(local);
  };

  const showUndoError = (message: string) => {
    setUndoError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setUndoError(null), 4000);
  };

  const onClear = async () => {
    await clearHistory();
    await clearServerHistory().catch(() => {});
    setHistory([]);
  };

  /**
   * Undo one sorted file: the server moves it back to its original location
   * and re-queues it at the top of the Sort tab.
   */
  const onUndoRecord = async (item: HistoryRecord) => {
    if (undoingId) return;
    setUndoingId(item.id);
    try {
      await undoHistoryItem(item.id);
      // Drop it from the server-backed list and the local cache
      removeHistoryRecord(item.id).catch(() => {});
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
      setUndoError(null);
    } catch (e: any) {
      showUndoError(e?.message || 'Could not undo this file');
    } finally {
      setUndoingId(null);
    }
  };

  // Server history stores the post-sort path in file.uri; local AsyncStorage
  // records keep the original path, so derive the destination for those.
  const revealRecord = (item: HistoryRecord) => {
    const dest =
      sortedDestinationPath(item.file.uri, item.action.label, item.file.name, item.file.extension)
      ?? item.file.uri
      ?? '';
    revealInFolder(dest);
  };

  const renderItem = ({ item }: { item: HistoryRecord }) => {
    const isUndoing = undoingId === item.id;
    return (
      <Pressable
        onPress={() => revealRecord(item)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.surface,
            opacity: pressed ? 0.75 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: item.action.color + '20' }]}>
          <FileIcon type={item.file.type} size={28} color={item.action.color} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.file.name}.{item.file.extension}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: item.action.color }]}>
          <Text style={styles.badgeText}>{item.action.label}</Text>
        </View>
        <Pressable
          onPress={() => onUndoRecord(item)}
          disabled={!!undoingId}
          accessibilityLabel={`Undo sorting of ${item.file.name}`}
          style={({ pressed }) => [
            styles.undoButton,
            { backgroundColor: colors.accentSoft, opacity: undoingId && !isUndoing ? 0.4 : 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {isUndoing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="arrow-undo" size={18} color={colors.accent} />
          )}
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg }]}
      edges={['top']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>History</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {history.length} sorted {history.length === 1 ? 'file' : 'files'}
          </Text>
        </View>
        {history.length > 0 && (
          <Pressable onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {!!undoError && (
        <View style={[styles.undoError, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.undoErrorText} numberOfLines={2}>
            {undoError}
          </Text>
        </View>
      )}

      <TutorialTarget id="history-content" style={styles.listTarget}>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyIllustration
                emoji="📋"
                title="No history yet"
                subtitle="Sort some files and they will appear here."
              />
            </View>
          }
        />
      </TutorialTarget>
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
  clearButton: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  listTarget: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  undoButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  undoError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  undoErrorText: {
    flex: 1,
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
