import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { HistoryRecord } from '../lib/types';
import { loadHistory, clearHistory } from '../lib/storage';
import { fetchHistory, clearServerHistory } from '../lib/api';
import FileIcon from '../components/FileIcon';
import EmptyIllustration from '../components/EmptyIllustration';

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadHistoryData();
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
      // server unreachable — fall back to local
    }
    // Fallback: load from AsyncStorage
    const local = await loadHistory();
    setHistory(local);
  };

  const onClear = async () => {
    await clearHistory();
    await clearServerHistory().catch(() => {});
    setHistory([]);
  };

  const renderItem = ({ item }: { item: HistoryRecord }) => (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isDark ? '#1e293b' : '#fff',
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
        <Text style={[styles.name, { color: isDark ? '#fff' : '#0f172a' }]} numberOfLines={1}>
          {item.file.name}.{item.file.extension}
        </Text>
        <Text style={[styles.meta, { color: isDark ? '#94a3b8' : '#64748b' }]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: item.action.color }]}>
        <Text style={styles.badgeText}>{item.action.label}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}
      edges={['top']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>History</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            {history.length} sorted {history.length === 1 ? 'file' : 'files'}
          </Text>
        </View>
        {history.length > 0 && (
          <Pressable onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
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
  emptyContainer: {
    height: 400,
    justifyContent: 'center',
  },
});
