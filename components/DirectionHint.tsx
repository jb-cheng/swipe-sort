import { StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { SortAction, SwipeDirection } from '../lib/types';
import SwipeHint from './SwipeHint';

interface Props {
  direction: SwipeDirection;
  action: SortAction;
  hintDir: SharedValue<SwipeDirection>;
  hintOpacity: SharedValue<number>;
}

export default function DirectionHint({ direction, action, hintDir, hintOpacity }: Props) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: hintDir.value === direction ? hintOpacity.value : 0,
  }));

  return (
    <Animated.View style={[styles.hintContainer, animatedStyle]}>
      <SwipeHint direction={direction} label={action.label} color={action.color} opacity={1} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hintContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    pointerEvents: 'none',
  },
});
