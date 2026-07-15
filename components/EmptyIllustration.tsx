import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

interface ActionConfig {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface Props {
  emoji?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  actions?: ActionConfig[];
}

export default function EmptyIllustration({ emoji, iconName, title, subtitle, actions }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, // infinite
      true, // reverse
    );

    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : iconName ? (
          <Ionicons name={iconName} size={64} color={isDark ? '#475569' : '#cbd5e1'} />
        ) : (
          <Text style={styles.emoji}>📂</Text>
        )}
      </Animated.View>
      <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
        {subtitle}
      </Text>
      {actions?.map((action, index) => (
        <View key={index} style={{ marginTop: index === 0 ? 20 : 12 }}>
          <Pressable
            onPress={action.onPress}
            disabled={action.disabled}
            style={({ pressed }) => ({
              backgroundColor: '#3B82F6',
              borderRadius: 16,
              paddingHorizontal: 28,
              paddingVertical: 14,
              opacity: action.disabled ? 0.4 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={styles.buttonText}>{action.label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
