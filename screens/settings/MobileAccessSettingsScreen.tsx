import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-qr-code';
import { useTheme } from '../../lib/ThemeContext';
import { MobileAccessInfo } from '../../lib/types';
import {
  getMobileAccess,
  setMobileAccessEnabled,
  resetMobileToken,
  onMobileAccessChanged,
} from '../../lib/api';

export default function MobileAccessSettingsScreen() {
  const { colors } = useTheme();
  const [info, setInfo] = useState<MobileAccessInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMobileAccess().then(setInfo).catch(() => {});
    onMobileAccessChanged(setInfo);
  }, []);

  const handleToggle = async (value: boolean) => {
    setBusy(true);
    const updated = await setMobileAccessEnabled(value);
    if (updated) setInfo(updated);
    setBusy(false);
  };

  const handleResetToken = async () => {
    setBusy(true);
    const updated = await resetMobileToken();
    if (updated) setInfo(updated);
    setBusy(false);
  };

  const enabled = info?.enabled === true;
  const displayUrl = info?.url ? info.url.split('/?t=')[0] : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.text }]}>Mobile access</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Sort from your phone on the same Wi-Fi
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Switch
                value={enabled}
                onValueChange={handleToggle}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            )}
          </View>
        </View>

        {enabled && !info?.lanIp && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.warning, { color: colors.textSecondary }]}>
              No local network connection found. Connect to Wi-Fi and restart the app to generate a pairing code.
            </Text>
          </View>
        )}

        {enabled && info?.url && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Pair your phone</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Open your phone camera, scan this code, and open the link. Keep both devices on the same Wi-Fi network.
            </Text>

            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <QRCode value={info.url} size={200} bgColor="#ffffff" fgColor="#000000" />
              </View>
            </View>

            {displayUrl && (
              <Text style={[styles.urlText, { color: colors.textSecondary }]}>{displayUrl}</Text>
            )}

            <Pressable
              onPress={handleResetToken}
              disabled={busy}
              style={({ pressed }) => [
                styles.resetButton,
                { backgroundColor: colors.accentSoft, opacity: pressed || busy ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.resetButtonText, { color: colors.accent }]}>New pairing key</Text>
            </Pressable>
            <Text style={[styles.resetHint, { color: colors.textMuted }]}>
              Invalidates the current code. Previously paired phones must scan again.
            </Text>
          </View>
        )}

        {!enabled && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              When enabled, your computer accepts connections from devices on your local network. Requests must present the pairing key embedded in the QR code, and you can rotate it at any time.
            </Text>
          </View>
        )}
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
    gap: 12,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  warning: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  qrWrap: {
    alignItems: 'center',
    marginVertical: 16,
  },
  qrBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
  },
  urlText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  resetButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resetHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
});
