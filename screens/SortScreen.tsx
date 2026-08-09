import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
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
import FullscreenPreview from '../components/FullscreenPreview';
import TutorialTarget from '../components/TutorialTarget';
import { FileItem, SortAction, HistoryRecord, MobileAccessInfo } from '../lib/types';
import { loadActions, addHistory } from '../lib/storage';
import { pregeneratePreviews, openFile, revealInFolder, fetchState, setFolder, sortFile, undoSort, getMobileAccess, onMobileAccessChanged, setMobileAccessEnabled } from '../lib/api';
import { DEMO_FILES } from '../lib/demoFiles';
import { useTheme } from '../lib/ThemeContext';
import { useTutorial } from '../lib/TutorialContext';

export default function SortScreen() {
  const { colors, isDark } = useTheme();
  const { active: tutorialActive, notify: notifyTutorial } = useTutorial();

  const [actions, setActions] = useState<SortAction[]>([]);
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [sorting, setSorting] = useState(false);
  const [activeAction, setActiveAction] = useState<SortAction | null>(null);
  const [sortedCount, setSortedCount] = useState(0);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileAccessInfo, setMobileAccessInfo] = useState<MobileAccessInfo | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [fullscreenFile, setFullscreenFile] = useState<FileItem | null>(null);

  // Tutorial demo mode: swaps in a local-only queue so the real queue,
  // server state, and on-disk files are never touched during the tutorial.
  const demoMode = tutorialActive;
  const [demoQueue, setDemoQueue] = useState<FileItem[]>(DEMO_FILES);
  const [demoUndo, setDemoUndo] = useState<FileItem[]>([]);

  const isElectron = typeof (window as any).electronAPI !== 'undefined';
  // Single active sorter: while remote control is enabled, the phone owns
  // sorting and the desktop becomes a read-only viewer.
  const remoteLocked = !demoMode && isElectron && mobileAccessInfo?.enabled === true;
  const queueLenRef = useRef(queue.length);
  queueLenRef.current = queue.length;

  // Track previously dismissed file IDs for cleanup
  const dismissedRef = useRef<Set<string>>(new Set());

  // Track mobile access status from Electron (shown as a hint when enabled)
  useEffect(() => {
    getMobileAccess().then((info) => {
      if (info) setMobileAccessInfo(info);
    });
    onMobileAccessChanged(setMobileAccessInfo);
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

  // Reset the demo queue every time the tutorial starts
  useEffect(() => {
    if (demoMode) {
      setDemoQueue(DEMO_FILES.map((f) => ({ ...f })));
      setDemoUndo([]);
      setSorting(false);
      setActiveAction(null);
    }
  }, [demoMode]);

  // Poll server state every 3s for multi-device sync. Phones always poll;
  // the desktop polls too while remote-locked so it can watch the phone sort.
  const shouldPoll = !isElectron || remoteLocked;
  useEffect(() => {
    if (!shouldPoll) return;

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
        // server unreachable — keep current state; DisconnectedOverlay
        // owns the disconnect indication on phones.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [folderPath, shouldPoll, isElectron]);

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

  // Refresh queue/undo from the server without the loading spinner.
  // Used to recover when another device already consumed the current card.
  const resyncFromServer = useCallback(() => {
    fetchState()
      .then((state) => {
        setQueue(state.files);
        if (state.folderPath) setFolderPath(state.folderPath);
        setSortedCount(state.history.length);
        setUndoAvailable((state.undoStack?.length ?? 0) > 0);
      })
      .catch(() => {
        // server unreachable — keep current state
      });
  }, []);

  const displayedQueue = demoMode ? demoQueue : queue;
  const current = displayedQueue[0];
  const effectiveUndoAvailable = demoMode ? demoUndo.length > 0 : undoAvailable;

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

      // Tutorial: local-only sort, no server calls or history writes.
      // Button sorts already notified at press time; only swipes notify here.
      if (demoMode) {
        const wasSwipe = activeAction === null;
        setDemoUndo((prev) => [current, ...prev]);
        setDemoQueue((prev) => prev.slice(1));
        setSorting(false);
        setActiveAction(null);
        if (wasSwipe) notifyTutorial('sort');
        return;
      }

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
        if (/not found in queue/i.test(e?.message || '')) {
          // Another device already sorted this file — resync instead of
          // leaving a stale card on screen.
          resyncFromServer();
        }
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
    [current, demoMode, activeAction, notifyTutorial, resyncFromServer],
  );

  const handleUndo = async () => {
    if (remoteLocked) return;
    // Tutorial: local-only undo
    if (demoMode) {
      const last = demoUndo[0];
      if (!last) return;
      setDemoUndo((prev) => prev.slice(1));
      setDemoQueue((prev) => [last, ...prev]);
      notifyTutorial('undo');
      return;
    }

    try {
      const result = await undoSort();
      if (result.ok && result.state) {
        setQueue(result.state.files);
        setSortedCount(result.state.history.length);
        setUndoAvailable((result.state.undoStack?.length ?? 0) > 0);
      }
    } catch (e: any) {
      console.warn('Undo failed:', e.message);
      if (/nothing to undo/i.test(e?.message || '')) {
        // Another device already consumed the undo stack — resync silently.
        resyncFromServer();
      }
    }
  };

  const handleAction = useCallback(
    (action: SortAction) => {
      if (sorting || !current || remoteLocked) return;
      setSorting(true);
      setActiveAction(action);
      if (demoMode) notifyTutorial('button-sort');
    },
    [sorting, current, demoMode, notifyTutorial, remoteLocked],
  );

  const handleDisableRemoteControl = async () => {
    const updated = await setMobileAccessEnabled(false);
    if (updated) setMobileAccessInfo(updated);
  };

  // ── Keyboard hotkeys (web / Electron) ──────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (sorting || remoteLocked) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      // 'u' for undo
      if (e.key.toLowerCase() === 'u' && effectiveUndoAvailable) {
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
  }, [actions, sorting, handleAction, effectiveUndoAvailable, handleUndo, remoteLocked]);

  // ── Renderers ──────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Sort Files</Text>
        {folderPath ? (
          <Text
            style={[styles.pathText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {folderPath}
          </Text>
        ) : (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Swipe or press a key to sort
          </Text>
        )}
      </View>
      <View style={styles.badgeRow}>
        {folderPath && isElectron && !demoMode && (
          <Pressable
            onPress={handlePickFolder}
            accessibilityLabel="Switch folder"
            style={({ pressed }) => [
              styles.switchFolderButton,
              { backgroundColor: colors.accentSoft, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="folder-open-outline" size={16} color={colors.accent} />
          </Pressable>
        )}
        <TutorialTarget id="undo">
          <Pressable
            onPress={handleUndo}
            disabled={!effectiveUndoAvailable || remoteLocked}
            style={[styles.undoButton, { backgroundColor: colors.accentSoft }, (!effectiveUndoAvailable || remoteLocked) && styles.undoButtonDisabled]}
          >
            <Ionicons name="arrow-undo" size={16} color={colors.accent} />
          </Pressable>
        </TutorialTarget>
        <View style={styles.badge}>
          <Text style={[styles.badgeText, { color: colors.accent }]}>{displayedQueue.length}</Text>
          <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>left</Text>
        </View>
      </View>
    </View>
  );

  const renderRemoteLockBanner = () => {
    if (!remoteLocked) return null;
    return (
      <View style={[styles.remoteLockBanner, { backgroundColor: colors.accentSoft }]}>
        <View style={styles.remoteLockTextRow}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} />
          <View style={styles.remoteLockText}>
            <Text style={[styles.remoteLockTitle, { color: colors.accent }]}>
              Remote control active
            </Text>
            <Text style={[styles.remoteLockSubtitle, { color: colors.textSecondary }]}>
              Sorting is locked on this device while your phone is in control.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleDisableRemoteControl}
          style={({ pressed }) => [
            styles.remoteLockButton,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.remoteLockButtonText}>Take back control</Text>
        </Pressable>
      </View>
    );
  };

  const renderLoading = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.centerText, { color: colors.textSecondary }]}>
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
      {mobileAccessInfo?.enabled && mobileAccessInfo.url && (
        <Text style={[styles.tailscaleHint, { color: colors.textMuted }]}>
          Mobile access: {mobileAccessInfo.url.split('/?t=')[0]}
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
        <TutorialTarget id="card" style={styles.cardTarget}>
          <FileCard
            key={current.id}
            file={current}
            actions={actions}
            activeAction={activeAction}
            sorting={sorting}
            locked={remoteLocked}
            onSortStart={() => setSorting(true)}
            onSortComplete={handleSortComplete}
            onTap={demoMode ? undefined : (f) => openFile(f.uri ?? '')}
            onDoubleTap={demoMode ? undefined : (f) => revealInFolder(f.uri ?? '')}
            onLongPress={demoMode ? undefined : (f) => setFullscreenFile(f)}
          />
        </TutorialTarget>
      ) : demoMode ? (
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            Demo queue empty
          </Text>
        </View>
      ) : (
        renderEmptyDone()
      )}
    </View>
  );

  const renderContent = () => {
    if (demoMode) return renderCardArea();
    if (loading) return renderLoading();
    if (error) return renderError();
    if (!folderPath) return renderNoFolder();
    return renderCardArea();
  };

  const showActionButtons = demoMode
    ? demoQueue.length > 0
    : folderPath && queue.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {renderHeader()}
      {renderRemoteLockBanner()}
      {renderContent()}
      {showActionButtons && (
        <TutorialTarget id="action-buttons">
          <ActionButtons actions={actions} disabled={sorting || !current || remoteLocked} onAction={handleAction} />
        </TutorialTarget>
      )}
      {fullscreenFile && (
        <FullscreenPreview file={fullscreenFile} onClose={() => setFullscreenFile(null)} />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonDisabled: {
    opacity: 0.35,
  },
  switchFolderButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: { fontSize: 18, fontWeight: '800' },
  badgeLabel: { fontSize: 11, fontWeight: '600' },
  cardArea: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  cardTarget: {
    flex: 1,
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
  remoteLockBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  remoteLockTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  remoteLockText: {
    flex: 1,
  },
  remoteLockTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  remoteLockSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  remoteLockButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  remoteLockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
