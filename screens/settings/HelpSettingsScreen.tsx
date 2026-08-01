import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../lib/ThemeContext';
import { useTutorial } from '../../lib/TutorialContext';

export default function HelpSettingsScreen() {
  const { colors } = useTheme();
  const { startTutorial } = useTutorial();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable onPress={startTutorial} style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="play" size={20} color={colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Start Tutorial</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Learn how to sort files interactively
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tipHeading, { color: colors.text }]}>Tips</Text>
          <View style={styles.tipRow}>
            <Ionicons name="hand-right" size={16} color={colors.textMuted} />
            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
              Swipe the card in any direction to sort into the matching folder
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="key" size={16} color={colors.textMuted} />
            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
              Press number keys (1-4) on desktop for instant sorting
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="expand" size={16} color={colors.textMuted} />
            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
              Long-press a card to see a fullscreen preview
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
  tipHeading: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
