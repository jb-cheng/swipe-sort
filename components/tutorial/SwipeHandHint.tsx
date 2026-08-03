import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SortAction, SwipeDirection } from '../../lib/types';

const DURATION = 1800;
const DRAG = 110;

const VECTOR: Record<SwipeDirection, { x: number; y: number }> = {
  left: { x: -DRAG, y: 0 },
  right: { x: DRAG, y: 0 },
  up: { x: 0, y: -DRAG },
  down: { x: 0, y: DRAG },
  none: { x: DRAG, y: 0 },
};

const ARROW: Record<SwipeDirection, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  none: '→',
};

interface Props {
  /** Window coordinates of the swipe start point (card center). */
  x: number;
  y: number;
  action: SortAction;
}

/**
 * Looping "ghost hand" that presses down on the card, drags toward the
 * action's swipe direction, then fades out. A destination chip shows what
 * the swipe will do. Rendered by the tutorial overlay above the scrim hole.
 */
export default function SwipeHandHint({ x, y, action }: Props) {
  const t = useSharedValue(0);
  const v = VECTOR[action.direction];

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: DURATION, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id]);

  // Phases: 0-0.14 appear+press, 0.28-0.72 drag, 0.72-0.86 release+fade, rest = pause
  const handStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.08, 0.72, 0.86, 1], [0, 1, 1, 0, 0]),
    transform: [
      { translateX: interpolate(t.value, [0, 0.28, 0.72, 1], [0, 0, v.x, v.x]) },
      { translateY: interpolate(t.value, [0, 0.28, 0.72, 1], [0, 0, v.y, v.y]) },
      { scale: interpolate(t.value, [0, 0.14, 0.28, 0.72, 0.86, 1], [1, 0.8, 0.8, 0.8, 1, 1]) },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.06, 0.14, 0.34, 1], [0, 0.85, 0, 0]),
    transform: [{ scale: interpolate(t.value, [0.06, 0.34, 1], [0.5, 1.7, 1.7]) }],
  }));

  const chipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.3, 0.5, 0.78, 0.92, 1], [0, 1, 1, 0, 0]),
    transform: [
      { translateX: v.x * 1.35 },
      { translateY: v.y * 1.35 },
      { scale: interpolate(t.value, [0.3, 0.5, 1], [0.7, 1, 1]) },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, { left: x, top: y }]}>
      {/* Destination chip: where the swipe goes and what it does */}
      <Animated.View style={[styles.chip, { backgroundColor: action.color }, chipStyle]}>
        <Text style={styles.chipArrow}>{ARROW[action.direction]}</Text>
        <Text style={styles.chipLabel}>{action.label}</Text>
      </Animated.View>

      {/* Touch ripple at the press point */}
      <Animated.View style={[styles.ring, ringStyle]} />

      {/* The hand itself */}
      <Animated.View style={[styles.hand, handStyle]}>
        <Ionicons name="hand-right" size={40} color="#fff" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    zIndex: 40,
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hand: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  chipArrow: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  chipLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
