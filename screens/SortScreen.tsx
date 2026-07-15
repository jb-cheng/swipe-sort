import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import FileCard from '../components/FileCard';
import ActionButtons from '../components/ActionButtons';
import EmptyIllustration from '../components/EmptyIllustration';
import { FileItem, SortAction, HistoryRecord } from '../lib/types';
import { loadActions, addHistory } from '../lib/storage';
import { pregeneratePreviews, openFile, fetchState, setFolder, sortFile, undoSort } from '../lib/api';

export default function SortScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [actions, setActions] = useState<SortAction[]>([]);
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [sorting, setSorting] = useState(false);
  const [activeAction, setActiveAction] = useState<SortAction | null>(null);
  const [sortedCount, setSortedCount] = useState(0);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);

  const isElectron = typeof (window as any).electronAPI !== 'undefined';
  const queueLenRef = useRef(queue.length);
  queueLenRef.current = queue.length;

  // Track previously dismissed file IDs for cleanup
  const dismissedRef = useRef<Set<string>>(new Set());

  // Listen for server port from Electron preload (only when standalone server is active)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onServerPort) {
      api.onServerPort((port: number | null) => setServerPort(port));
    }
  }, []);

  // Reload actions from AsyncStorage and refresh server state every time the tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadActions().then(setActions);
      fetchState()
        .then((state) => {
          setQueue(state.files);
          if (state.folderPath) setFolderPath(state.folderPath);
          if (state.history.length > 0) setSortedCount(state.history.length);
          setUndoAvailable((state.undoStack?.length ?? 0) > 0);
        })
        .catch(() => {
          // server unreachable — keep current state
        });
    }, [])
  );

  // Load initial state from server (once on mount)
  useEffect(() => {
    loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll server state every 3s ONLY when not in IPC mode (multi-device sync via Tailscale)
  useEffect(() => {
    if (isElectron) return; // IPC is synchronous, no polling needed

    const interval = setInterval(async () => {
      try {
        const state = await fetchState();
        if (state.files.length !== queueLenRef.current) {
          setQueue(state.files);
        }
        if (state.folderPath && state.folderPath !== folderPath) {
          setFolderPath(state.folderPath);
        }
        setUndoAvailable((state.undoStack?.length ?? 0) > 0);
      } catch {
        // server unreachable — keep current state
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [folderPath, isElectron]);

  const loadFromServer = async () => {
    try {
      setLoading(true);
      setError(null);
      const state = await fetchState();
      setQueue(state.files);
      setFolderPath(state.folderPath);
      if (state.history.length > 0) {
        setSortedCount(state.history.length);
      }
      setUndoAvailable((state.undoStack?.length ?? 0) > 0);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Cannot connect to server');
      setLoading(false);
    }
  };

  const current = queue[0];

  const handlePickFolder = async () => {
    let pickedPath: string | null = null;

    // Electron: use native folder dialog
    if ((window as any).electronAPI?.pickFolder) {
      pickedPath = await (window as any).electronAPI.pickFolder();
    } else {
      // Web: prompt for path input
      pickedPath = prompt('Enter the full path to the folder:');
    }

    if (!pickedPath) return;

    try {
      setLoading(true);
      setError(null);
      const data = await setFolder(pickedPath);
      setQueue(data.files);
      setFolderPath(pickedPath);
      setSortedCount(0);
      setUndoAvailable(false);
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load folder');
      setLoading(false);
    }
  };

  const handleSortComplete = useCallback(
    async (action: SortAction) => {
      if (!current) return;

      // Track the dismissed file for cleanup
      dismissedRef.current.add(current.id);

      let sortSuccess = false;
      try {
        const result = await sortFile(current.id, action);
        setUndoAvailable((result.undoStackLength ?? 0) > 0);
        sortSuccess = true;
      } catch (e: any) {
        console.warn('Sort failed:', e.message);
        dismissedRef.current.delete(current.id);
        setSorting(false);
        setActiveAction(null);
        return;
      }

      if (!sortSuccess) return;

      // Record in local AsyncStorage history too
      const record: HistoryRecord = {
        id: `${Date.now()}-${current.id}`,
        file: current,
        action,
        timestamp: Date.now(),
      };
      await addHistory(record);

      // Empty the dismissed set periodically to avoid memory leak
      if (dismissedRef.current.size > 50) {
        dismissedRef.current.clear();
      }

      setQueue((prev) => prev.slice(1));
      setSortedCount((c) => c + 1);
      setSorting(false);
      setActiveAction(null);

      // Pre-generate previews for the next files in the queue (lazy loading)
      pregeneratePreviews(5).catch(() => {});
    },
    [current],
  );

  const handleUndo = async () => {
    try {
      const result = await undoSort();
      if (result.ok && result.state) {
        setQueue(result.state.files);
        setSortedCount(result.state.history.length);
        setUndoAvailable((result.state.undoStack?.length ?? 0) > 0);
      }
    } catch (e: any) {
      console.warn('Undo failed:', e.message);
    }
  };

  const handleAction = useCallback(
    (action: SortAction) => {
      if (sorting || !current) return;
      setSorting(true);
      setActiveAction(action);
    },
    [sorting, current],
  );

  // ── Keyboard hotkeys (web / Electron) ──────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (sorting) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      // 'u' for undo
      if (e.key.toLowerCase() === 'u' && undoAvailable) {
        e.preventDefault();
        handleUndo();
        return;
      }

      const key = e.key.toLowerCase();
      const action = actions.find((a) => a.key.toLowerCase() === key);
      if (action) {
        e.preventDefault();
        handleAction(action);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, sorting, handleAction, undoAvailable, handleUndo]);

  const backgroundColor = isDark ? '#0f172a' : '#f8fafc';

  // ── Renderers ──────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>Sort Files</Text>
        {folderPath ? (
          <Text
            style={[styles.pathText, { color: isDark ? '#94a3b8' : '#64748b' }]}
            numberOfLines={1}
          >
            {folderPath}
          </Text>
        ) : (
          <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            Swipe or press a key to sort
          </Text>
        )}
      </View>
      <View style={styles.badgeRow}>
        <Pressable
          onPress={handleUndo}
          disabled={!undoAvailable}
          style={[styles.undoButton, !undoAvailable && styles.undoButtonDisabled]}
        >
          <Ionicons name="arrow-undo" size={16} color="#3B82F6" />
        </Pressable>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{queue.length}</Text>
          <Text style={styles.badgeLabel}>left</Text>
        </View>
      </View>
    </View>
  );

  const renderLoading = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={[styles.centerText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
        Loading files...
      </Text>
    </View>
  );

  const renderError = () => (
    <EmptyIllustration
      emoji="❌"
      title={error || 'Something went wrong'}
      subtitle={isElectron
        ? 'Could not load files. Check the folder path.'
        : 'Make sure the desktop app is running and the server is active.'}
      actions={[{ label: 'Retry', onPress: loadFromServer }]}
    />
  );

  const renderNoFolder = () => (
    <View style={styles.center}>
      <EmptyIllustration
        emoji="📁"
        title={isElectron ? 'Select a folder to start' : 'Waiting for folder'}
        subtitle={isElectron
          ? 'Pick a folder full of files. The app will move each file into a subfolder named after the action you choose.'
          : 'Open the desktop app to select a folder. Files will appear here automatically.'}
        actions={isElectron ? [{ label: 'Pick a Folder', onPress: handlePickFolder }] : undefined}
      />
      {serverPort && (
        <Text style={[styles.tailscaleHint, { color: isDark ? '#64748b' : '#94a3b8' }]}>
          Mobile access: http://localhost:{serverPort}
        </Text>
      )}
    </View>
  );

  const renderEmptyDone = () => (
    <EmptyIllustration
      emoji="🎉"
      title="All sorted!"
      subtitle={`${sortedCount} files organized into subfolders.`}
      actions={[
        { label: 'Undo Last Sort', onPress: handleUndo, disabled: !undoAvailable },
        { label: 'Sort Another Folder', onPress: handlePickFolder },
      ]}
    />
  );

  const renderCardArea = () => (
    <View style={styles.cardArea}>
      {current ? (
        <FileCard
          key={current.id}
          file={current}
          actions={actions}
          activeAction={activeAction}
          sorting={sorting}
          onSortStart={() => setSorting(true)}
          onSortComplete={handleSortComplete}
          onTap={(f) => openFile(f.uri ?? '')}
        />
      ) : (
        renderEmptyDone()
      )}
    </View>
  );

  const renderContent = () => {
    if (loading) return renderLoading();
    if (error) return renderError();
    if (!folderPath) return renderNoFolder();
    return renderCardArea();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {renderHeader()}
      {renderContent()}
      {folderPath && queue.length > 0 && (
        <ActionButtons actions={actions} disabled={sorting || !current} onAction={handleAction} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  pathText: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  undoButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonDisabled: {
    opacity: 0.35,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: { fontSize: 18, fontWeight: '800', color: '#3B82F6' },
  badgeLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  cardArea: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  centerText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  tailscaleHint: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
