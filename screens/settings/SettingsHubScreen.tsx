import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../lib/ThemeContext';
import { SettingsStackParamList } from '../../lib/navigation';
import TutorialTarget from '../../components/TutorialTarget';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHub'>;

interface Row {
  screen: keyof SettingsStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  electronOnly?: boolean;
}

const ROWS: Row[] = [
  {
    screen: 'AppearanceSettings',
    icon: 'color-palette',
    title: 'Appearance',
    subtitle: 'Theme and color mode',
  },
  {
    screen: 'SortActionsSettings',
    icon: 'swap-horizontal',
    title: 'Sort Actions',
    subtitle: 'Hotkeys, swipe directions, colors',
  },
  {
    screen: 'WindowSettings',
    icon: 'desktop',
    title: 'Window',
    subtitle: 'Always on top',
    electronOnly: true,
  },
  {
    screen: 'MobileAccessSettings',
    icon: 'phone-portrait',
    title: 'Mobile Access',
    subtitle: 'Sort from your phone',
    electronOnly: true,
  },
  {
    screen: 'HelpSettings',
    icon: 'help-circle',
    title: 'Help',
    subtitle: 'Tutorial and tips',
  },
];

export default function SettingsHubScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const isElectron = typeof (window as any).electronAPI !== 'undefined';

  const visibleRows = ROWS.filter((r) => !r.electronOnly || isElectron);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Theme, actions, and preferences
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <TutorialTarget id="settings-list">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {visibleRows.map((row, i) => (
            <Pressable
              key={row.screen}
              onPress={() => navigation.navigate(row.screen)}
              style={[
                styles.row,
                i < visibleRows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={row.icon} size={20} color={colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                  {row.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
          </View>
        </TutorialTarget>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
});
