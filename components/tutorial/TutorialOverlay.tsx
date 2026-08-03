import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useTutorial,
  TUTORIAL_STEPS,
  TutorialStep,
  TargetRect,
  TutorialScreen,
} from '../../lib/TutorialContext';
import { useTheme } from '../../lib/ThemeContext';
import { ThemeColors } from '../../lib/theme';
import { navigationRef, getCurrentTabName, navigateToTab } from '../../lib/navigation';
import { loadActions } from '../../lib/storage';
import { SortAction } from '../../lib/types';
import ConfettiBurst from './ConfettiBurst';
import SwipeHandHint from './SwipeHandHint';
import KeyCapHint from './KeyCapHint';

const SCRIM_COLOR = 'rgba(2, 6, 23, 0.93)';
const FINALE_SCRIM = 'rgba(2, 6, 23, 0.8)';
const TOOLTIP_BG = 'rgba(13, 20, 38, 0.92)';
const CARET_W = 10;
const CARET_H = 11;
const HOLE_PADDING = 10;
const HOLE_RADIUS = 18;
const FINALE_DURATION = 2600;

interface Firework {
  id: number;
  x: number;
  y: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function padRect(rect: TargetRect, winW: number, winH: number): TargetRect {
  return {
    x: clamp(rect.x - HOLE_PADDING, 0, winW),
    y: clamp(rect.y - HOLE_PADDING, 0, winH),
    width: Math.min(rect.width + HOLE_PADDING * 2, winW),
    height: Math.min(rect.height + HOLE_PADDING * 2, winH),
  };
}

/** Non-navigate steps must be on their tab; Settings always lands on the hub. */
function goToStepScreen(screen: TutorialScreen) {
  if (!navigationRef.isReady()) return;
  if (screen === 'Settings') {
    navigationRef.navigate('Settings', { screen: 'SettingsHub' });
  } else {
    navigateToTab(screen);
  }
}

export default function TutorialOverlay() {
  const { colors } = useTheme();
  const {
    phase,
    stepIndex,
    currentStep,
    targets,
    bursts,
    endTutorial,
    notify,
    notifyScreenFocus,
    clearBurst,
  } = useTutorial();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [actions, setActions] = useState<SortAction[]>([]);
  const [holeReady, setHoleReady] = useState(false);
  const [fireworks, setFireworks] = useState<Firework[]>([]);

  // Web: the scrim is a single rounded rect with a huge box-shadow spread, so
  // the hole corners are true border-radius cuts (one element, one paint, no
  // translucent-overlap artifacts). Native falls back to rects + quarter disks.
  const isWeb = Platform.OS === 'web';

  const rect = currentStep.targetKey ? targets[currentStep.targetKey] : undefined;
  const showHole = phase === 'steps' && !!rect;

  // Load the user's actions for the swipe demo + keycap hints
  useEffect(() => {
    loadActions().then(setActions);
  }, [stepIndex]);

  // Spotlight hole geometry (animated so the hole glides between targets)
  const hx = useSharedValue(0);
  const hy = useSharedValue(0);
  const hw = useSharedValue(winW);
  const hh = useSharedValue(winH);

  useEffect(() => {
    if (!rect || phase !== 'steps') {
      setHoleReady(false);
      return;
    }
    const p = padRect(rect, winW, winH);
    const duration = holeReady ? 300 : 420;
    const easing = Easing.out(Easing.cubic);
    hx.value = withTiming(p.x, { duration, easing });
    hy.value = withTiming(p.y, { duration, easing });
    hw.value = withTiming(p.width, { duration, easing });
    hh.value = withTiming(p.height, { duration, easing });
    setHoleReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect?.x, rect?.y, rect?.width, rect?.height, winW, winH, phase]);

  // Pulsing glow on the spotlight ring
  const ringPulse = useSharedValue(1);
  useEffect(() => {
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-navigate to the tab a step belongs to (navigate steps excepted: the user taps those).
  // Settings steps always land on the hub, even if the stack was left on a sub-screen.
  useEffect(() => {
    if (phase !== 'steps') return;
    const step = TUTORIAL_STEPS[stepIndex];
    if (step.completion === 'navigate') return;
    if (step.screen === 'Settings') {
      goToStepScreen('Settings');
    } else if (getCurrentTabName() !== step.screen) {
      goToStepScreen(step.screen);
    }
  }, [phase, stepIndex]);

  // Complete 'navigate' steps when the user actually switches tabs
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const subscribe = () => {
      if (navigationRef.isReady()) {
        unsub = navigationRef.addListener('state', () => {
          const name = getCurrentTabName();
          if (name) notifyScreenFocus(name);
        });
      } else {
        retry = setTimeout(subscribe, 300);
      }
    };
    subscribe();
    return () => {
      unsub?.();
      if (retry) clearTimeout(retry);
    };
  }, [notifyScreenFocus]);

  // Finale: staggered fireworks, then auto-dismiss back to the Sort tab
  useEffect(() => {
    if (phase !== 'finale') {
      setFireworks([]);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 6; i++) {
      timers.push(
        setTimeout(() => {
          setFireworks((prev) => [
            ...prev,
            { id: i, x: winW * (0.18 + Math.random() * 0.64), y: winH * (0.15 + Math.random() * 0.45) },
          ]);
        }, 150 + i * 330),
      );
    }
    timers.push(
      setTimeout(() => {
        endTutorial();
        navigateToTab('Sort');
      }, FINALE_DURATION),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const topScrimStyle = useAnimatedStyle(() => ({ height: hy.value }));
  const bottomScrimStyle = useAnimatedStyle(() => ({ top: hy.value + hh.value }));
  const leftScrimStyle = useAnimatedStyle(() => ({
    top: hy.value,
    width: hx.value,
    height: hh.value,
  }));
  const rightScrimStyle = useAnimatedStyle(() => ({
    top: hy.value,
    left: hx.value + hw.value,
    height: hh.value,
  }));
  // Round the hole corners: clipped quarter disks sitting exactly inside each
  // hole corner (no overlap with the scrim rects, so the translucent scrim
  // color stays uniform and the hole matches the ring's rounded outline).
  const cornerR = HOLE_RADIUS;
  const tlCornerStyle = useAnimatedStyle(() => ({ left: hx.value, top: hy.value }));
  const trCornerStyle = useAnimatedStyle(() => ({ left: hx.value + hw.value - cornerR, top: hy.value }));
  const blCornerStyle = useAnimatedStyle(() => ({ left: hx.value, top: hy.value + hh.value - cornerR }));
  const brCornerStyle = useAnimatedStyle(() => ({ left: hx.value + hw.value - cornerR, top: hy.value + hh.value - cornerR }));
  const ringStyle = useAnimatedStyle(() => ({
    left: hx.value,
    top: hy.value,
    width: hw.value,
    height: hh.value,
    opacity: ringPulse.value,
  }));
  const maskStyle = useAnimatedStyle(() => ({
    left: hx.value,
    top: hy.value,
    width: hw.value,
    height: hh.value,
  }));

  const demoAction = useMemo(
    () => actions.find((a) => a.direction !== 'none') ?? actions[0] ?? null,
    [actions],
  );

  const cardRect = targets.card;
  const handCenter = cardRect
    ? { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2 }
    : null;
  // The tab bar is always registered as a tab-* target, so its top edge is a
  // reliable anchor for bottom-pinning the tooltip above it.
  const tabBarTop = Object.entries(targets).find(([key]) => key.startsWith('tab-'))?.[1]?.y ?? null;

  // Keep the Skip button clear of the spotlight hole: if the hole would
  // cover it (e.g. the undo button in the top-right), tuck Skip in next to
  // the progress pips instead of letting it sit on top of the target.
  const headerTop = insets.top + 12;
  const skipFrame = { x: winW - 24 - 72, y: headerTop, width: 72, height: 36 };
  const hole = phase === 'steps' && showHole && rect ? padRect(rect, winW, winH) : null;
  const skipCollides =
    !!hole &&
    hole.x < skipFrame.x + skipFrame.width &&
    hole.x + hole.width > skipFrame.x &&
    hole.y < skipFrame.y + skipFrame.height &&
    hole.y + hole.height > skipFrame.y;

  const skipButton = (
    <Pressable onPress={endTutorial} hitSlop={12} style={styles.skipButton}>
      <Text style={styles.skipText}>Skip</Text>
    </Pressable>
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* ── Scrim with spotlight hole ─────────────────────────────── */}
      {phase === 'steps' && showHole && holeReady ? (
        <>
          {/* Transparent click blockers: everything outside the hole eats taps.
              On web the visual scrim is the box-shadow mask below; on native
              these rects keep the scrim color and the corner disks round it. */}
          <Animated.View
            style={[isWeb ? styles.blocker : styles.scrim, styles.scimTop, topScrimStyle]}
            pointerEvents="auto"
          />
          <Animated.View
            style={[isWeb ? styles.blocker : styles.scrim, styles.scrimBottom, bottomScrimStyle]}
            pointerEvents="auto"
          />
          <Animated.View
            style={[isWeb ? styles.blocker : styles.scrim, styles.scrimLeft, leftScrimStyle]}
            pointerEvents="auto"
          />
          <Animated.View
            style={[isWeb ? styles.blocker : styles.scrim, styles.scrimRight, rightScrimStyle]}
            pointerEvents="auto"
          />
          {isWeb ? (
            <Animated.View style={[styles.holeMask, maskStyle]} pointerEvents="none" />
          ) : (
            <>
              <Animated.View style={[styles.cornerClip, tlCornerStyle]} pointerEvents="none">
                <View style={[styles.cornerDisk, styles.cornerDiskTL]} />
              </Animated.View>
              <Animated.View style={[styles.cornerClip, trCornerStyle]} pointerEvents="none">
                <View style={[styles.cornerDisk, styles.cornerDiskTR]} />
              </Animated.View>
              <Animated.View style={[styles.cornerClip, blCornerStyle]} pointerEvents="none">
                <View style={[styles.cornerDisk, styles.cornerDiskBL]} />
              </Animated.View>
              <Animated.View style={[styles.cornerClip, brCornerStyle]} pointerEvents="none">
                <View style={[styles.cornerDisk, styles.cornerDiskBR]} />
              </Animated.View>
            </>
          )}
          <Animated.View
            style={[styles.ring, { borderColor: colors.accent, shadowColor: colors.accent }, ringStyle]}
            pointerEvents="none"
          />
        </>
      ) : phase === 'steps' ? (
        <View style={[StyleSheet.absoluteFill, styles.fullScrim]} pointerEvents="auto" />
      ) : null}

      {/* ── Ghost hand swipe demo ─────────────────────────────────── */}
      {phase === 'steps' && currentStep.id === 'swipe' && handCenter && demoAction && (
        <SwipeHandHint x={handCenter.x} y={handCenter.y} action={demoAction} />
      )}

      {/* ── Confetti bursts for completed steps ───────────────────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {bursts.map((b) => (
          <ConfettiBurst
            key={b.id}
            x={b.x ?? winW / 2}
            y={b.y ?? winH / 2}
            onDone={() => clearBurst(b.id)}
          />
        ))}
      </View>

      {/* ── Header: progress dots + skip ──────────────────────────── */}
      {phase === 'steps' && (
        <View style={[styles.header, { top: headerTop }]} pointerEvents="box-none">
          <View style={styles.headerLeft}>
            <View style={styles.dotsChip}>
              <View style={styles.dots}>
                {TUTORIAL_STEPS.map((s, i) => (
                  <View
                    key={s.id}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === stepIndex ? colors.accent : 'rgba(255,255,255,0.9)',
                        width: i === stepIndex ? 20 : 8,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            {skipCollides && skipButton}
          </View>
          {!skipCollides && skipButton}
        </View>
      )}

      {/* ── Coach tooltip ─────────────────────────────────────────── */}
      {phase === 'steps' && (
        <CoachTooltip
          step={currentStep}
          index={stepIndex}
          total={TUTORIAL_STEPS.length}
          rect={rect}
          tabBarTop={tabBarTop}
          winW={winW}
          winH={winH}
          insets={insets}
          colors={colors}
          actions={actions}
          onManual={() => notify('manual')}
        />
      )}

      {/* ── Finale fireworks ──────────────────────────────────────── */}
      {phase === 'finale' && (
        <View style={[StyleSheet.absoluteFill, styles.finale]} pointerEvents="auto">
          {fireworks.map((f) => (
            <ConfettiBurst key={f.id} x={f.x} y={f.y} count={30} />
          ))}
          <Ionicons name="checkmark-circle" size={76} color={colors.accent} />
          <Text style={styles.finaleTitle}>You're all set!</Text>
          <Text style={styles.finaleSub}>Pick a folder and start sorting.</Text>
        </View>
      )}
    </View>
  );
}

// ── Coach tooltip ──────────────────────────────────────────────────

interface TooltipProps {
  step: TutorialStep;
  index: number;
  total: number;
  rect: TargetRect | undefined;
  /** Top edge of the tab bar (null if no tab target is registered). */
  tabBarTop: number | null;
  winW: number;
  winH: number;
  insets: EdgeInsets;
  colors: ThemeColors;
  actions: SortAction[];
  onManual: () => void;
}

function CoachTooltip({
  step,
  index,
  total,
  rect,
  tabBarTop,
  winW,
  winH,
  insets,
  colors,
  actions,
  onManual,
}: TooltipProps) {
  const isWeb = Platform.OS === 'web';
  const tooltipWidth = Math.min(380, winW - 40);

  // Measured bubble height: lets the attached-below placement pull itself
  // up so it never clips off the bottom of the screen (or covers the card).
  const [bubbleH, setBubbleH] = useState(0);

  let position: { top?: number; bottom?: number; left: number };
  let caret: 'up' | 'down' | null = null;
  let caretX = 0;

  if (!rect) {
    position = { top: winH * 0.36, left: (winW - tooltipWidth) / 2 };
  } else {
    const p = padRect(rect, winW, winH);
    const midY = p.y + p.height / 2;
    const spaceBelow = winH - (p.y + p.height);
    const huge = p.height > winH * 0.5;
    const left = clamp(p.x + p.width / 2 - tooltipWidth / 2, 20, winW - tooltipWidth - 20);
    caretX = clamp(p.x + p.width / 2 - left, 28, tooltipWidth - 28);

    if (huge) {
      // Tall targets: pin the bubble where it won't cover the target. If
      // there's room below (the swipe card), attach it under the target
      // with a caret — it may overlap dimmed content, but never the
      // spotlighted card; near-full-height lists (history/settings) pin
      // above the tab bar so the bubble doesn't sit on top of the very
      // rows it explains.
      if (spaceBelow > 120) {
        position = { top: p.y + p.height + 14, left };
        caret = 'up';
      } else if (tabBarTop != null) {
        position = { bottom: winH - tabBarTop + 14, left };
        caret = null;
      } else {
        position = { top: insets.top + 72, left };
        caret = null;
      }
    } else if (midY < winH / 2 && spaceBelow > 170) {
      position = { top: p.y + p.height + 14, left };
      caret = 'up';
    } else {
      position = { bottom: winH - p.y + 14, left };
      caret = 'down';
    }
  }

  // Keep the bubble on-screen: once its height is known, pull it up if the
  // attached-below placement would overflow past the bottom edge.
  if (bubbleH > 0 && typeof position.top === 'number' && position.top + bubbleH > winH - 8) {
    position = { top: winH - bubbleH - 8, left: position.left };
  }

  // Entrance: fade + slide in from the side the caret points at
  const entrance = useSharedValue(0);
  const slideDir = useSharedValue(1);
  useEffect(() => {
    slideDir.value = caret === 'down' ? -1 : 1;
    entrance.value = 0;
    entrance.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 18 * slideDir.value },
      { scale: 0.97 + 0.03 * entrance.value },
    ],
  }));

  // Always-dark glass bubble: belongs to the spotlight layer in any theme.
  // Web blurs what's behind it and glows with the accent; native uses a deep
  // drop shadow instead.
  const bubbleStyle: ViewStyle = {
    backgroundColor: TOOLTIP_BG,
    borderColor: `${colors.accent}4D`,
    ...(isWeb
      ? ({
          backdropFilter: 'blur(14px)',
          boxShadow: `0 12px 32px rgba(0,0,0,0.55), 0 0 22px ${colors.accent}40`,
        } as ViewStyle)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 24,
          elevation: 24,
        }),
  };

  const progressPct = ((index + 1) / total) * 100;

  return (
    <Animated.View
      style={[styles.tooltip, bubbleStyle, { width: tooltipWidth }, position, animStyle]}
      onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
      pointerEvents="auto"
    >
      {caret === 'up' && (
        <View
          style={[
            styles.caret,
            styles.caretUp,
            { left: caretX - CARET_W, borderBottomColor: colors.accent },
            isWeb && { boxShadow: `0 0 10px ${colors.accent}66` },
          ]}
        />
      )}
      {caret === 'down' && (
        <View
          style={[
            styles.caret,
            styles.caretDown,
            { left: caretX - CARET_W, borderTopColor: colors.accent },
            isWeb && { boxShadow: `0 0 10px ${colors.accent}66` },
          ]}
        />
      )}

      <Text style={styles.tooltipTitle}>{step.title}</Text>
      <Text style={styles.tooltipBody}>{step.body}</Text>

      {step.id === 'buttons' && isWeb && actions.length > 0 && (
        <View style={styles.keyRow}>
          <Text style={styles.keyRowText}>or press</Text>
          <KeyCapHint label={actions[0].key} accentColor={colors.accent} />
          <Text style={styles.keyRowText}>to sort</Text>
        </View>
      )}
      {step.id === 'undo' && isWeb && (
        <View style={styles.keyRow}>
          <Text style={styles.keyRowText}>or press</Text>
          <KeyCapHint label="U" accentColor={colors.accent} />
          <Text style={styles.keyRowText}>to undo</Text>
        </View>
      )}

      {step.actionLabel && (
        <Pressable onPress={onManual} style={[styles.manualButton, { backgroundColor: colors.accent }]}>
          <Text style={styles.manualButtonText}>{step.actionLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      )}

      {!step.actionLabel && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${progressPct}%` }]} />
        </View>
      )}
    </Animated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  scrim: {
    position: 'absolute',
    backgroundColor: SCRIM_COLOR,
  },
  blocker: {
    position: 'absolute',
  },
  holeMask: {
    position: 'absolute',
    borderRadius: HOLE_RADIUS,
    backgroundColor: 'transparent',
    // One paint covers the whole screen; the element's own rounded rect is the
    // hole. True border-radius corners, zero overlap with anything.
    boxShadow: `0px 0px 0px 9999px ${SCRIM_COLOR}`,
  },
  scimTop: { left: 0, right: 0, top: 0 },
  scrimBottom: { left: 0, right: 0, bottom: 0 },
  scrimLeft: { left: 0 },
  scrimRight: { right: 0 },
  fullScrim: {
    backgroundColor: SCRIM_COLOR,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: HOLE_RADIUS,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 6,
    zIndex: 30,
  },
  cornerClip: {
    position: 'absolute',
    width: HOLE_RADIUS,
    height: HOLE_RADIUS,
    overflow: 'hidden',
  },
  cornerDisk: {
    position: 'absolute',
    width: HOLE_RADIUS * 2,
    height: HOLE_RADIUS * 2,
    borderRadius: HOLE_RADIUS,
    backgroundColor: SCRIM_COLOR,
  },
  cornerDiskTL: { left: -HOLE_RADIUS, top: -HOLE_RADIUS },
  cornerDiskTR: { left: 0, top: -HOLE_RADIUS },
  cornerDiskBL: { left: -HOLE_RADIUS, top: 0 },
  cornerDiskBR: { left: 0, top: 0 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 70,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  skipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tooltip: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    zIndex: 80,
  },
  caret: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: CARET_W,
    borderRightWidth: CARET_W,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  caretUp: {
    top: -CARET_H,
    borderBottomWidth: CARET_H,
  },
  caretDown: {
    bottom: -CARET_H,
    borderTopWidth: CARET_H,
  },
  tooltipTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 5,
  },
  tooltipBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  keyRowText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  manualButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  finale: {
    backgroundColor: FINALE_SCRIM,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  finaleTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
  },
  finaleSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    fontWeight: '600',
  },
});
