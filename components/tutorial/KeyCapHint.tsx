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

const DURATION = 1500;

interface Props {
  label: string;
  accentColor: string;
}

/**
 * Looping keyboard-key press animation: the cap dips down with its 3D edge
 * collapsing, while a ripple ring flashes above it. Shown in tutorial
 * tooltips on keyboard platforms.
 */
export default function KeyCapHint({ label, accentColor }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: DURATION, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Press window: dips at 12%, held until 42%, released by 58%, idle until repeat.
  const capStyle = useAnimatedStyle(() => {
    const down = interpolate(t.value, [0, 0.12, 0.42, 0.58, 1], [0, 1, 1, 0, 0]);
    return {
      transform: [{ translateY: down * 3 }, { scale: 1 - down * 0.05 }],
      borderBottomWidth: 4 - down * 2.5,
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.1, 0.18, 0.5, 1], [0, 0.9, 0, 0]),
    transform: [{ scale: interpolate(t.value, [0.1, 0.5, 1], [0.6, 1.5, 1.5]) }],
  }));

  return (
    <Animated.View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.ring, { borderColor: accentColor }, ringStyle]} />
      <Animated.View style={[styles.cap, capStyle]}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cap: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 4,
    borderBottomColor: '#94A3B8',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: '#E2E8F0',
    borderLeftColor: '#E2E8F0',
    borderRightColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '900',
  },
  ring: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
  },
});
