import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../lib/ThemeContext';
import { THEMES, ThemeName, ThemeMode } from '../../lib/theme';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function AppearanceSettingsScreen() {
  const { colors, themeName, mode, setThemeName, setMode } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Theme</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => {
              const isActive = t.name === themeName;
              return (
                <Pressable
                  key={t.name}
                  onPress={() => setThemeName(t.name as ThemeName)}
                  style={styles.themeItem}
                >
                  <View
                    style={[
                      styles.themeSwatch,
                      { backgroundColor: t.dark.bg },
                      isActive && { borderColor: colors.accent, borderWidth: 3 },
                    ]}
                  >
                    <View style={[styles.themeSwatchInner, { backgroundColor: t.dark.accent }]} />
                  </View>
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: isActive ? colors.accent : colors.textMuted },
                      isActive && { fontWeight: '800' },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Mode</Text>
          <View style={[styles.modeRow, { backgroundColor: colors.surfaceHover }]}>
            {MODES.map((m) => {
              const isActive = m.value === mode;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setMode(m.value)}
                  style={[
                    styles.modeButton,
                    isActive && { backgroundColor: colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      { color: isActive ? '#fff' : colors.textSecondary },
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.modeHint}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.modeHintText, { color: colors.textMuted }]}>
              System follows your OS dark mode setting
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  themeItem: {
    alignItems: 'center',
    gap: 6,
  },
  themeSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  themeSwatchInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  themeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  modeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  modeHintText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
