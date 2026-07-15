import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import SortScreen from './screens/SortScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import ErrorBoundary from './components/ErrorBoundary';

const Tab = createBottomTabNavigator();

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: {
                backgroundColor: isDark ? '#0f172a' : '#fff',
                borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
                height: 72,
                paddingBottom: 10,
                paddingTop: 8,
              },
              tabBarActiveTintColor: '#3B82F6',
              tabBarInactiveTintColor: isDark ? '#64748b' : '#94a3b8',
              tabBarIcon: ({ color, size }) => {
                let name: keyof typeof Ionicons.glyphMap = 'help-circle';
                if (route.name === 'Sort') name = 'layers';
                if (route.name === 'History') name = 'time';
                if (route.name === 'Actions') name = 'options';
                return <Ionicons name={name} size={size} color={color} />;
              },
            })}
          >
            <Tab.Screen name="Sort" component={SortScreen} />
            <Tab.Screen name="History" component={HistoryScreen} />
            <Tab.Screen name="Actions" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
