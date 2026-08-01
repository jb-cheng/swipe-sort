import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { markTutorialSeen } from './storage';

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TutorialScreen = 'Sort' | 'History' | 'Settings';
export type TutorialEvent = 'sort' | 'button-sort' | 'undo' | 'manual';

export interface TutorialStep {
  id: string;
  /** Tab the step belongs to. Non-navigate steps auto-navigate here when entered. */
  screen: TutorialScreen;
  /** Registry key of the spotlighted element (null = no hole in the scrim). */
  targetKey: string | null;
  title: string;
  body: string;
  /** Events that complete the step, or 'navigate' (completed by arriving on `screen`). */
  completion: TutorialEvent[] | 'navigate';
  /** Label for the tooltip button on manual steps. */
  actionLabel?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'swipe',
    screen: 'Sort',
    targetKey: 'card',
    title: 'Swipe to Sort',
    body: 'Drag the card in any direction and let go. Each direction files it into the matching folder.',
    completion: ['sort', 'button-sort'],
  },
  {
    id: 'buttons',
    screen: 'Sort',
    targetKey: 'action-buttons',
    title: 'One-Tap Sorting',
    body: 'Tap a colored button to sort the current file instantly.',
    completion: ['sort', 'button-sort'],
  },
  {
    id: 'undo',
    screen: 'Sort',
    targetKey: 'undo',
    title: 'Undo Mistakes',
    body: 'Sorted the wrong way? Undo brings the last file right back. Try it now.',
    completion: ['undo'],
  },
  {
    id: 'history-tab',
    screen: 'History',
    targetKey: 'tab-History',
    title: 'Open History',
    body: 'Tap the History tab below. Every file you sort is logged there.',
    completion: 'navigate',
  },
  {
    id: 'history-view',
    screen: 'History',
    targetKey: 'history-content',
    title: 'Your Sorting Log',
    body: 'Each sorted file lands here with its action and the time. The Clear button wipes the log.',
    completion: ['manual'],
    actionLabel: 'Next',
  },
  {
    id: 'settings-tab',
    screen: 'Settings',
    targetKey: 'tab-Settings',
    title: 'Open Settings',
    body: 'Tap the Settings tab below to see what you can customize.',
    completion: 'navigate',
  },
  {
    id: 'settings-view',
    screen: 'Settings',
    targetKey: 'settings-list',
    title: 'Make It Yours',
    body: 'Themes live in Appearance, hotkeys and swipe directions in Sort Actions, and you can replay this tutorial anytime from Help.',
    completion: ['manual'],
    actionLabel: 'Finish',
  },
];

export interface ConfettiBurstRequest {
  id: number;
  /** Window coordinates of the burst origin. Null = let the overlay pick the screen center. */
  x: number | null;
  y: number | null;
}

interface TutorialContextValue {
  active: boolean;
  phase: 'steps' | 'finale';
  stepIndex: number;
  steps: TutorialStep[];
  currentStep: TutorialStep;
  targets: Record<string, TargetRect>;
  bursts: ConfettiBurstRequest[];
  startTutorial: () => void;
  endTutorial: () => void;
  notify: (event: TutorialEvent) => void;
  notifyScreenFocus: (screenName: string) => void;
  registerTarget: (key: string, rect: TargetRect) => void;
  unregisterTarget: (key: string) => void;
  clearBurst: (id: number) => void;
}

const TutorialContext = createContext<TutorialContextValue>({
  active: false,
  phase: 'steps',
  stepIndex: 0,
  steps: TUTORIAL_STEPS,
  currentStep: TUTORIAL_STEPS[0],
  targets: {},
  bursts: [],
  startTutorial: () => {},
  endTutorial: () => {},
  notify: () => {},
  notifyScreenFocus: () => {},
  registerTarget: () => {},
  unregisterTarget: () => {},
  clearBurst: () => {},
});

const rectsEqual = (a: TargetRect | undefined, b: TargetRect) =>
  !!a &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<'steps' | 'finale'>('steps');
  const [stepIndex, setStepIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, TargetRect>>({});
  const [bursts, setBursts] = useState<ConfettiBurstRequest[]>([]);

  // Ref mirrors so event handlers never go stale mid-gesture.
  const activeRef = useRef(active);
  activeRef.current = active;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const burstIdRef = useRef(0);

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setPhase('steps');
    setBursts([]);
    setActive(true);
  }, []);

  const endTutorial = useCallback(() => {
    setActive(false);
    setPhase('steps');
    setStepIndex(0);
    setBursts([]);
    markTutorialSeen();
  }, []);

  /** Fire a celebration at the center of the step's spotlight target, then advance. */
  const completeCurrentStep = useCallback(() => {
    const step = TUTORIAL_STEPS[stepIndexRef.current];
    const rect = step.targetKey ? targetsRef.current[step.targetKey] : undefined;
    burstIdRef.current += 1;
    setBursts((prev) => [
      ...prev,
      {
        id: burstIdRef.current,
        x: rect ? rect.x + rect.width / 2 : null,
        y: rect ? rect.y + rect.height / 2 : null,
      },
    ]);

    const isLast = stepIndexRef.current >= TUTORIAL_STEPS.length - 1;
    if (isLast) {
      setPhase('finale');
    } else {
      setStepIndex((i) => i + 1);
    }
  }, []);

  const notify = useCallback(
    (event: TutorialEvent) => {
      if (!activeRef.current || phaseRef.current !== 'steps') return;
      const step = TUTORIAL_STEPS[stepIndexRef.current];
      if (step.completion === 'navigate') return;
      if (step.completion.includes(event)) {
        completeCurrentStep();
      }
    },
    [completeCurrentStep],
  );

  const notifyScreenFocus = useCallback(
    (screenName: string) => {
      if (!activeRef.current || phaseRef.current !== 'steps') return;
      const step = TUTORIAL_STEPS[stepIndexRef.current];
      if (step.completion === 'navigate' && step.screen === screenName) {
        completeCurrentStep();
      }
    },
    [completeCurrentStep],
  );

  const registerTarget = useCallback((key: string, rect: TargetRect) => {
    setTargets((prev) => {
      if (rectsEqual(prev[key], rect)) return prev;
      return { ...prev, [key]: rect };
    });
  }, []);

  const unregisterTarget = useCallback((key: string) => {
    setTargets((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearBurst = useCallback((id: number) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return (
    <TutorialContext.Provider
      value={{
        active,
        phase,
        stepIndex,
        steps: TUTORIAL_STEPS,
        currentStep: TUTORIAL_STEPS[stepIndex],
        targets,
        bursts,
        startTutorial,
        endTutorial,
        notify,
        notifyScreenFocus,
        registerTarget,
        unregisterTarget,
        clearBurst,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
