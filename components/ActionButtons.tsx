import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SortAction, SwipeDirection } from '../lib/types';

interface Props {
  actions: SortAction[];
  disabled?: boolean;
  onAction: (action: SortAction) => void;
}

const DIRECTION_ICON: Record<SwipeDirection, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  none: '',
};

export default function ActionButtons({ actions, disabled, onAction }: Props) {
  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          disabled={disabled}
          onPress={() => onAction(action)}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: action.color,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <View style={styles.keyBadge}>
            <Text style={styles.keyText}>{action.key.toUpperCase()}</Text>
          </View>
          <Text style={styles.label}>{action.label}</Text>
          {action.direction !== 'none' && (
            <Text style={styles.arrow}>{DIRECTION_ICON[action.direction]}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    justifyContent: 'center',
  },
  button: {
    width: '22%',
    minWidth: 70,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  keyBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  keyText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  arrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
});
