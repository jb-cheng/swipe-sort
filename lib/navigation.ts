import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';

export type SettingsStackParamList = {
  SettingsHub: undefined;
  AppearanceSettings: undefined;
  SortActionsSettings: undefined;
  WindowSettings: undefined;
  MobileAccessSettings: undefined;
  HelpSettings: undefined;
};

export type RootTabParamList = {
  Sort: undefined;
  History: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};

export const navigationRef = createNavigationContainerRef<RootTabParamList>();

/** Returns the name of the currently focused top-level tab ('Sort' | 'History' | 'Settings'). */
export function getCurrentTabName(): keyof RootTabParamList | null {
  if (!navigationRef.isReady()) return null;
  const state = navigationRef.getRootState();
  const route = state.routes[state.index];
  return (route?.name as keyof RootTabParamList) ?? null;
}

/** Navigate to a top-level tab by name (typed loosely so step configs can drive it). */
export function navigateToTab(name: keyof RootTabParamList) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (n: string) => void)(name);
}
