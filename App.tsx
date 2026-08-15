import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import SortScreen from './screens/SortScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsNavigator from './screens/settings/SettingsNavigator';
import ErrorBoundary from './components/ErrorBoundary';
import DisconnectedOverlay from './components/DisconnectedOverlay';
import TutorialOverlay from './components/tutorial/TutorialOverlay';
import TutorialTarget from './components/TutorialTarget';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { TutorialProvider, useTutorial } from './lib/TutorialContext';
import { hasSeenTutorial } from './lib/storage';
import { RootTabParamList, navigationRef } from './lib/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();

// Default tab button (PlatformPressable, same as react-navigation's default)
// wrapped in a measurable target so the tutorial can spotlight each tab.
function createTutorialTabButton(routeName: keyof RootTabParamList) {
  const Wrapped = (props: BottomTabBarButtonProps) => (
    <TutorialTarget id={`tab-${routeName}`} style={tabButtonStyles.flex}>
      <PlatformPressable {...props} />
    </TutorialTarget>
  );
  Wrapped.displayName = `TutorialTabButton(${routeName})`;
  return Wrapped;
}

const tabButtonStyles = StyleSheet.create({
  flex: { flex: 1 },
});

const SortTabButton = createTutorialTabButton('Sort');
const HistoryTabButton = createTutorialTabButton('History');
const SettingsTabButton = createTutorialTabButton('Settings');

function AppContent() {
  const { colors, isDark } = useTheme();
  const { active: tutorialActive, startTutorial } = useTutorial();

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    hasSeenTutorial().then((seen) => {
      if (!seen) {
        const timer = setTimeout(() => startTutorial(), 600);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              height: 72,
              paddingBottom: 10,
              paddingTop: 8,
            },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textSecondary,
            tabBarIcon: ({ color, size }) => {
              let name: keyof typeof Ionicons.glyphMap = 'help-circle';
              if (route.name === 'Sort') name = 'layers';
              if (route.name === 'History') name = 'time';
              if (route.name === 'Settings') name = 'settings';
              return <Ionicons name={name} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Sort" component={SortScreen} options={{ tabBarButton: SortTabButton }} />
          <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarButton: HistoryTabButton }} />
          <Tab.Screen name="Settings" component={SettingsNavigator} options={{ tabBarButton: SettingsTabButton }} />
        </Tab.Navigator>
        {tutorialActive && <TutorialOverlay />}
        <DisconnectedOverlay />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <TutorialProvider>
            <AppContent />
          </TutorialProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
