import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { FileItem, SortAction, SwipeDirection } from '../lib/types';
import { FILE_META } from '../lib/fileHelpers';
import FileIcon from './FileIcon';
import DirectionHint from './DirectionHint';
import FilePreview from './FilePreview';

interface Props {
  file: FileItem;
  actions: SortAction[];
  activeAction: SortAction | null;
  sorting: boolean;
  onSortStart: () => void;
  onSortComplete: (action: SortAction) => void;
  onTap?: (file: FileItem) => void;
  onLongPress?: (file: FileItem) => void;
}

const SWIPE_THRESHOLD = 0.22;
const EXIT_DISTANCE = 1.35;
const TAP_PX_THRESHOLD = 15; // px — diff below this is a tap, above is a swipe
const DOUBLE_TAP_MS = 300; // ms window for double-tap detection

export default function FileCard({
  file,
  actions,
  activeAction,
  sorting,
  onSortStart,
  onSortComplete,
  onTap,
  onLongPress,
}: Props) {
  const { width, height } = useWindowDimensions();
  const meta = FILE_META[file.type] ?? FILE_META.unknown;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const hintOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const tapScale = useSharedValue(1);

  // Track the position where the gesture began (for tap detection)
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const thresholdX = useMemo(() => width * SWIPE_THRESHOLD, [width]);
  const thresholdY = useMemo(() => height * SWIPE_THRESHOLD, [height]);
  const exitX = useMemo(() => width * EXIT_DISTANCE, [width]);
  const exitY = useMemo(() => height * EXIT_DISTANCE, [height]);

  const directionForVector = (dx: number, dy: number): SwipeDirection => {
    'worklet';
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
  };

  const actionForDirection = (dir: SwipeDirection): SortAction | undefined => {
    return actions.find((a) => a.direction === dir);
  };

  const animateExit = (dir: SwipeDirection, action: SortAction) => {
    'worklet';
    let toX = 0;
    let toY = 0;
    if (dir === 'left') toX = -exitX;
    if (dir === 'right') toX = exitX;
    if (dir === 'up') toY = -exitY;
    if (dir === 'down') toY = exitY;

    const cleanup = (finished?: boolean) => {
      'worklet';
      if (finished) {
        runOnJS(onSortComplete)(action);
      }
    };

    translateX.value = withTiming(toX, { duration: 260, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(toY, { duration: 260, easing: Easing.out(Easing.cubic) });
    rotate.value = withTiming(dir === 'left' ? -18 : dir === 'right' ? 18 : 0, { duration: 260 });
    cardOpacity.value = withTiming(0, { duration: 260 }, cleanup);
    hintOpacity.value = 0;
  };

  const resetCard = () => {
    'worklet';
    translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
    translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
    rotate.value = withSpring(0, { damping: 15, stiffness: 120 });
    hintOpacity.value = withTiming(0, { duration: 120 });
  };

  const animateTapFeedback = () => {
    'worklet';
    tapScale.value = withSequence(
      withTiming(0.95, { duration: 60 }),
      withTiming(1, { duration: 100 }),
    );
  };

  useEffect(() => {
    if (activeAction) {
      onSortStart();
      animateExit(activeAction.direction, activeAction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAction]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value * tapScale.value },
    ],
    opacity: cardOpacity.value,
  }));

  const hintDir = useSharedValue<SwipeDirection>('none');
  const lastTapTime = useSharedValue(0);
  const longPressFired = useSharedValue(false);

  const panWithHints = Gesture.Pan()
    .enabled(!sorting)
    .onBegin((e) => {
      longPressFired.value = false;
      scale.value = withTiming(1.02, { duration: 120 });
      startX.value = e.absoluteX;
      startY.value = e.absoluteY;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      rotate.value = e.translationX * 0.04;
      const dir = directionForVector(e.translationX, e.translationY);
      const action = actionForDirection(dir);
      const progress = Math.max(
        Math.abs(e.translationX) / thresholdX,
        Math.abs(e.translationY) / thresholdY
      );
      hintOpacity.value = action ? Math.min(progress, 1) : 0;
      hintDir.value = action ? dir : 'none';
    })
    .onFinalize(() => {
      scale.value = withTiming(1, { duration: 120 });
      const dx = translateX.value;
      const dy = translateY.value;
      const dir = directionForVector(dx, dy);
      const action = actionForDirection(dir);
      const distance = Math.max(Math.abs(dx) / thresholdX, Math.abs(dy) / thresholdY);

      // Double-tap detection: fire onTap only on the second tap within 300ms
      const totalMovement = Math.sqrt(dx * dx + dy * dy);
      if (totalMovement < TAP_PX_THRESHOLD && onTap && !longPressFired.value) {
        const now = Date.now();
        if (lastTapTime.value > 0 && now - lastTapTime.value < DOUBLE_TAP_MS) {
          // Double-tap detected — fire callback
          lastTapTime.value = 0;
          animateTapFeedback();
          runOnJS(onTap)(file);
        } else {
          // First tap — just record the time
          lastTapTime.value = now;
          animateTapFeedback();
        }
        resetCard();
        return;
      }

      if (distance >= 1 && action && !sorting) {
        runOnJS(onSortStart)();
        animateExit(dir, action);
      } else {
        resetCard();
      }
    });

  const longPress = Gesture.LongPress()
    .enabled(!sorting && !!onLongPress)
    .minDuration(500)
    .maxDistance(10)
    .onStart(() => {
      longPressFired.value = true;
      scale.value = withTiming(1, { duration: 100 });
      if (onLongPress) {
        runOnJS(onLongPress)(file);
      }
    });

  const composed = Gesture.Simultaneous(panWithHints, longPress);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <View style={[styles.gradientBase, { backgroundColor: meta.gradient[0] }]} />
        <View style={[styles.gradientOverlay, { backgroundColor: meta.gradient[1] }]} />

        {(['left', 'right', 'up', 'down'] as SwipeDirection[]).map((dir) => {
          const action = actionForDirection(dir);
          if (!action) return null;
          return (
            <DirectionHint
              key={dir}
              direction={dir}
              action={action}
              hintDir={hintDir}
              hintOpacity={hintOpacity}
            />
          );
        })}

        <View style={styles.header}>
          <View style={styles.extensionBadge}>
            <Text style={styles.extensionText}>{file.extension}</Text>
          </View>
          <Text style={styles.typeText}>{file.type.toUpperCase()}</Text>
        </View>

        <View style={styles.preview}>
          <FilePreview file={file} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.name} numberOfLines={2}>
            {file.name}.{file.extension}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{file.size}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.meta}>{file.date}</Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  gradientBase: {
    ...StyleSheet.absoluteFill,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFill,
    opacity: 0.55,
  },
  hintContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    pointerEvents: 'none',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  extensionBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  extensionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  typeText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 22,
    paddingBottom: 26,
  },
  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  dot: {
    color: 'rgba(255,255,255,0.6)',
    marginHorizontal: 8,
  },
});
