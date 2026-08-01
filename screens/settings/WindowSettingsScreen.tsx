import { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { setAlwaysOnTop, getAlwaysOnTop } from '../../lib/api';

export default function WindowSettingsScreen() {
  const { colors } = useTheme();
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);

  useEffect(() => {
    getAlwaysOnTop().then(setAlwaysOnTopState).catch(() => {});
  }, []);

  const handleToggle = (value: boolean) => {
    setAlwaysOnTopState(value);
    setAlwaysOnTop(value).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.text }]}>Stay on top</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Keep window above all others
              </Text>
            </View>
            <Switch
              value={alwaysOnTop}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
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
  },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
});
