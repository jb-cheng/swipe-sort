import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';

const PALETTE = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#EC4899', '#FACC15', '#38BDF8'];

interface ParticleSpec {
  angle: number;
  distance: number;
  size: number;
  color: string;
  spin: number;
  round: boolean;
  gravity: number;
}

interface Props {
  x: number;
  y: number;
  count?: number;
  duration?: number;
  onDone?: () => void;
}

/**
 * One-shot confetti burst. All particles are driven by a single shared value
 * and rendered absolutely at (x, y) in window coordinates.
 */
export default function ConfettiBurst({ x, y, count = 26, duration = 1000, onDone }: Props) {
  const progress = useSharedValue(0);

  const particles = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
        distance: 70 + Math.random() * 100,
        size: 5 + Math.random() * 6,
        color: PALETTE[i % PALETTE.length],
        spin: (Math.random() - 0.5) * 560,
        round: Math.random() > 0.5,
        gravity: 40 + Math.random() * 80,
      })),
    [count],
  );

  useEffect(() => {
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished && onDone) runOnJS(onDone)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {particles.map((p, i) => (
        <Particle key={i} spec={p} progress={progress} x={x} y={y} />
      ))}
    </>
  );
}

function Particle({
  spec,
  progress,
  x,
  y,
}: {
  spec: ParticleSpec;
  progress: SharedValue<number>;
  x: number;
  y: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const reach = spec.distance * t;
    return {
      opacity: interpolate(t, [0, 0.65, 1], [1, 1, 0]),
      transform: [
        { translateX: Math.cos(spec.angle) * reach },
        { translateY: Math.sin(spec.angle) * reach + spec.gravity * t * t },
        { rotate: `${spec.spin * t}deg` },
        { scale: interpolate(t, [0, 0.12, 1], [0.3, 1, 0.6]) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: x,
          top: y,
          width: spec.size,
          height: spec.size,
          backgroundColor: spec.color,
          borderRadius: spec.round ? spec.size / 2 : 1.5,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    zIndex: 60,
  },
});
