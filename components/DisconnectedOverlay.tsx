import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import EmptyIllustration from './EmptyIllustration';
import { fetchState, isElectron, ApiError } from '../lib/api';
import { useTheme } from '../lib/ThemeContext';
import { useTutorial } from '../lib/TutorialContext';

const POLL_MS = 3000;
// Two consecutive missed polls (~6s) before showing the overlay, so a
// single network hiccup never triggers it.
const FAILURE_THRESHOLD = 2;

/**
 * Global disconnect watchdog for paired phones.
 *
 * When the desktop turns mobile access off (or closes), the phone's
 * requests start failing. This overlay covers whichever tab the phone is
 * on and explains what happened, then auto-recovers once the server is
 * reachable again. Desktop (Electron) never needs it: its server is local.
 */
export default function DisconnectedOverlay() {
  const { colors } = useTheme();
  const { active: tutorialActive } = useTutorial();
  const [visible, setVisible] = useState(false);
  const wasConnectedRef = useRef(false);
  const failuresRef = useRef(0);
  // Set when the server rejects our pairing token (401): the desktop
  // rotated the key or turned mobile access off, and retrying with the
  // same token can never succeed. The user must re-scan the QR code.
  const unauthorizedRef = useRef(false);

  useEffect(() => {
    if (isElectron() || tutorialActive) return;

    const interval = setInterval(async () => {
      try {
        await fetchState();
        failuresRef.current = 0;
        unauthorizedRef.current = false;
        wasConnectedRef.current = true;
        setVisible(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          unauthorizedRef.current = true;
        }
        // Only surface a disconnect after at least one successful poll; a
        // phone that never connected shows the screens' own error states.
        if (!wasConnectedRef.current) return;
        failuresRef.current += 1;
        if (failuresRef.current >= FAILURE_THRESHOLD) {
          setVisible(true);
        }
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [tutorialActive]);

  const handleReconnect = async () => {
    try {
      await fetchState();
      failuresRef.current = 0;
      setVisible(false);
    } catch {
      // still unreachable: polling keeps retrying in the background
    }
  };

  if (!visible) return null;

  const unauthorized = unauthorizedRef.current;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      <EmptyIllustration
        emoji={unauthorized ? '🔑' : '📡'}
        title={unauthorized ? 'Pairing expired' : 'Disconnected'}
        subtitle={unauthorized
          ? 'The desktop rotated its pairing key or turned off remote control. Scan the QR code in Settings > Mobile Access again.'
          : 'Remote control was turned off or the desktop app closed. Enable mobile access on the desktop again, then reconnect.'}
        actions={unauthorized ? undefined : [{ label: 'Reconnect', onPress: handleReconnect }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
