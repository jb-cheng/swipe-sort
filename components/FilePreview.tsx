import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FileItem } from '../lib/types';
import { getFilePreview, getNativeIcon } from '../lib/api';
import FileIcon from './FileIcon';

interface Props {
  file: FileItem;
}

/**
 * 3-Tier File Preview component with metadata card support.
 *
 * Tier 1 — Instant fallback: FileIcon (generic type-based icon).
 * Tier 2 — OS native icon: Electron-only, fetched via IPC.
 * Tier 3 — Rich content preview: images, audio cover art, text, PDF, CSV.
 *
 * Special: Metadata previews (prefixed with "META:") render as a styled card.
 */
export default function FilePreview({ file }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isElectron = typeof (window as any).electronAPI !== 'undefined';

  // Tier 3: Rich content preview state
  const [tier3Preview, setTier3Preview] = useState<string | null>(null);
  const [tier3Type, setTier3Type] = useState<'image' | 'text' | 'meta' | null>(null);
  const [tier3Loading, setTier3Loading] = useState(true);

  // Tier 2: OS native icon state (Electron only)
  const [nativeIcon, setNativeIcon] = useState<string | null>(null);
  const [nativeIconLoading, setNativeIconLoading] = useState(isElectron);

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setTier3Preview(null);
    setTier3Type(null);
    setTier3Loading(true);
    setNativeIcon(null);
    if (isElectron) {
      setNativeIconLoading(true);
    }

    const lowerExt = file.extension.toLowerCase();

    // ── Tier 2: Fetch OS native icon (Electron only) ────────────
    if (isElectron && file.uri) {
      getNativeIcon(file.uri).then((icon) => {
        if (!cancelledRef.current && icon) {
          setNativeIcon(icon);
        }
        setNativeIconLoading(false);
      }).catch(() => {
        if (!cancelledRef.current) setNativeIconLoading(false);
      });
    }

    // ── Tier 3: Rich content preview ────────────────────────────
    const fetchTier3 = async () => {
      if (!file.uri) {
        if (!cancelledRef.current) setTier3Loading(false);
        return;
      }
      try {
        const preview = await getFilePreview(file.id);
        if (!cancelledRef.current) {
          if (preview) {
            if (preview.startsWith('data:')) {
              setTier3Type('image');
              setTier3Preview(preview);
            } else if (preview.startsWith('META:')) {
              setTier3Type('meta');
              setTier3Preview(preview);
            } else {
              setTier3Type('text');
              setTier3Preview(preview);
            }
          }
          setTier3Loading(false);
        }
      } catch {
        if (!cancelledRef.current) setTier3Loading(false);
      }
    };
    fetchTier3();

    return () => {
      cancelledRef.current = true;
    };
  }, [file.id, file.uri, file.extension]);

  const iconSize = Math.min(windowWidth * 0.18, 128);

  // ── Determine which tier to display ──────────────────────────
  // Priority: Tier 3 > Tier 2 > Tier 1

  // Show loading while Tier 3 is fetching and we have nothing else
  const showLoading = tier3Loading && !tier3Preview && !nativeIcon;

  // Tier 3 — Image (photo, audio cover art, PDF/DOCX render, etc.)
  if (tier3Type === 'image' && tier3Preview) {
    const ext = file.extension.toLowerCase();
    const showBadge = ext === 'pdf' || ext === 'docx';
    return (
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: tier3Preview }}
          style={styles.image}
          resizeMode="contain"
        />
        {showBadge && (
          <View style={styles.textFooter}>
            <Text style={styles.textFooterLabel}>{ext.toUpperCase()} PREVIEW</Text>
          </View>
        )}
      </View>
    );
  }

  // Tier 3 — Metadata card (styled file info)
  if (tier3Type === 'meta' && tier3Preview) {
    return <MetadataCard preview={tier3Preview} file={file} />;
  }

  // Tier 3 — Text (plain text, PDF text, CSV table)
  if (tier3Type === 'text' && tier3Preview) {
    const isCsv = file.extension.toLowerCase() === 'csv';
    return (
      <View style={styles.textWrapper}>
        <ScrollView
          style={styles.textContainer}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text
            style={[
              styles.textContent,
              isCsv && styles.csvText,
            ]}
          >
            {tier3Preview}
          </Text>
        </ScrollView>
        {isCsv && (
          <View style={styles.textFooter}>
            <Text style={styles.textFooterLabel}>CSV PREVIEW</Text>
          </View>
        )}
      </View>
    );
  }

  // Tier 2 — OS native icon (show while Tier 3 loads, or as final)
  if (nativeIcon) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: nativeIcon }}
          style={styles.nativeIcon}
          resizeMode="contain"
        />
        {showLoading && (
          <ActivityIndicator
            size="small"
            color="rgba(255,255,255,0.5)"
            style={styles.loadingOverlay}
          />
        )}
      </View>
    );
  }

  // Loading state (Tier 3 in progress, no native icon yet)
  if (showLoading) {
    return (
      <View style={styles.container}>
        {/* Show Tier 1 icon as placeholder behind spinner */}
        <FileIcon type={file.type} size={iconSize} color="rgba(255,255,255,0.3)" />
        <ActivityIndicator
          size="large"
          color="rgba(255,255,255,0.7)"
          style={styles.spinnerOverlay}
        />
      </View>
    );
  }

  // Tier 1 — Instant fallback: generic type-based icon
  return (
    <View style={styles.container}>
      <FileIcon type={file.type} size={iconSize} color="#fff" />
    </View>
  );
}

/** Metadata card — parses META: prefixed text and renders a styled card. */
function MetadataCard({ preview, file }: { preview: string; file: FileItem }) {
  const lines = preview.split('\n');
  // Format: META:{typeLabel}\n{fileName}\n{sizeStr}\n{dateStr}
  const typeLabel = lines[0]?.replace(/^META:/, '') || file.type.toUpperCase();
  const fileName = lines[1] || `${file.name}.${file.extension}`;
  const sizeStr = lines[2] || file.size;
  const dateStr = lines[3] || file.date;

  const [textHeight, setTextHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const overflow = textHeight > containerHeight;

  // Animated values for the vertical ticker
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!overflow || textHeight === 0 || containerHeight === 0) return;

    let active = true;

    const doScroll = () => {
      if (!active) return;
      const overflow = textHeight - containerHeight;
      const scrollDuration = overflow * 80; // ~40px/s — comfortable reading speed
      Animated.sequence([
        // 1. Slowly scroll down — speed is consistent regardless of text length
        Animated.timing(translateY, {
          toValue: -overflow,
          duration: scrollDuration,
          useNativeDriver: true,
        }),
        // 1b. Pause at bottom before fading
        Animated.delay(700),
        // 2. Fade out
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        // 3. Snap position back (invisible since opacity=0)
        Animated.timing(translateY, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
        // 4. Fade back in
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => { if (active) doScroll(); });
    };

    doScroll();

    return () => {
      active = false;
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, [overflow, textHeight, containerHeight]);

  // Map file type to an icon name for the card
  const typeIconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    image: 'image',
    pdf: 'document-text',
    video: 'videocam',
    audio: 'musical-note',
    doc: 'document',
    spreadsheet: 'grid',
    archive: 'archive',
    code: 'code-slash',
  };
  const iconName = typeIconMap[file.type] || 'document-outline';

  return (
    <View style={styles.metaCard}>
      {/* Type icon + label */}
      <View style={styles.metaHeader}>
        <View style={styles.metaIconCircle}>
          <Ionicons name={iconName} size={28} color="#fff" />
        </View>
        <Text style={styles.metaTypeLabel}>{typeLabel}</Text>
      </View>

      {/* File name — auto-scrolls vertically if too long */}
      <View
        style={styles.metaFileNameContainer}
        onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
      >
        <Animated.View style={{ transform: [{ translateY }], opacity }}>
          <Text
            style={styles.metaFileName}
            onLayout={(e) => setTextHeight(e.nativeEvent.layout.height)}
          >
            {fileName}
          </Text>
        </Animated.View>
      </View>

      {/* Metadata rows */}
      <View style={styles.metaDivider} />
      <View style={styles.metaRow}>
        <Ionicons name="archive-outline" size={14} color="rgba(255,255,255,0.5)" />
        <Text style={styles.metaRowText}>{sizeStr}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.5)" />
        <Text style={styles.metaRowText}>{dateStr}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  nativeIcon: {
    width: 96,
    height: 96,
    borderRadius: 12,
  },
  textWrapper: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  textContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  textContent: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    lineHeight: 18,
  },
  csvText: {
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  textFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 4,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  textFooterLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 8,
  },
  spinnerOverlay: {
    position: 'absolute',
  },
  // ── Metadata card styles ───────────────────────────────────────
  metaCard: {
    flex: 1,
    width: '100%',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  metaIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metaTypeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  metaFileName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
  },
  metaFileNameContainer: {
    maxHeight: 80,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 16,
    alignItems: 'center',
  },
  metaDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  metaRowText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});
