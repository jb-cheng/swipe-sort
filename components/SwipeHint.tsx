import { View, Text, StyleSheet } from 'react-native';
import { SwipeDirection } from '../lib/types';

interface Props {
  direction: SwipeDirection;
  label: string;
  color: string;
  opacity: number;
}

export default function SwipeHint({ direction, label, color, opacity }: Props) {
  if (direction === 'none') return null;

  const positionStyles = {
    left: { top: 24, left: 24 },
    right: { top: 24, right: 24 },
    up: { top: 24, alignSelf: 'center' as const },
    down: { top: 24, alignSelf: 'center' as const },
  };

  const rotateMap = {
    left: '-12deg',
    right: '12deg',
    up: '-6deg',
    down: '6deg',
  };

  return (
    <View
      style={[
        styles.badge,
        positionStyles[direction],
        {
          opacity,
          borderColor: color,
          transform: [{ rotate: rotateMap[direction] }],
        },
      ]}
    >
      <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  label: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
