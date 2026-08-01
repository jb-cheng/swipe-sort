import { useCallback, useEffect, useRef, ReactNode } from 'react';
import { View, StyleProp, ViewStyle, useWindowDimensions } from 'react-native';
import { useTutorial } from '../lib/TutorialContext';

interface Props {
  id: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * Registers its window rect in the tutorial target registry so the overlay
 * can cut a spotlight hole around this element and let touches through to it.
 * Always rendered (not only during the tutorial) to avoid layout shifts.
 */
export default function TutorialTarget({ id, style, children }: Props) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget, active } = useTutorial();
  const { width, height } = useWindowDimensions();

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // measureInWindow exists on host components in both native and react-native-web.
    (node as any).measureInWindow?.((x: number, y: number, w: number, h: number) => {
      if (w > 1 && h > 1) {
        registerTarget(id, { x, y, width: w, height: h });
      }
    });
  }, [id, registerTarget]);

  // Re-measure when the window changes, the tutorial toggles, or after mount settles.
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [measure, width, height, active]);

  useEffect(() => () => unregisterTarget(id), [id, unregisterTarget]);

  return (
    <View ref={ref} style={style} onLayout={measure} collapsable={false}>
      {children}
    </View>
  );
}
