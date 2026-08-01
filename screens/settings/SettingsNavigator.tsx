import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../../lib/navigation';
import { useTheme } from '../../lib/ThemeContext';
import SettingsHubScreen from './SettingsHubScreen';
import AppearanceSettingsScreen from './AppearanceSettingsScreen';
import SortActionsSettingsScreen from './SortActionsSettingsScreen';
import WindowSettingsScreen from './WindowSettingsScreen';
import HelpSettingsScreen from './HelpSettingsScreen';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="SettingsHub"
        component={SettingsHubScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AppearanceSettings"
        component={AppearanceSettingsScreen}
        options={{ title: 'Appearance' }}
      />
      <Stack.Screen
        name="SortActionsSettings"
        component={SortActionsSettingsScreen}
        options={{ title: 'Sort Actions' }}
      />
      <Stack.Screen
        name="WindowSettings"
        component={WindowSettingsScreen}
        options={{ title: 'Window' }}
      />
      <Stack.Screen
        name="HelpSettings"
        component={HelpSettingsScreen}
        options={{ title: 'Help' }}
      />
    </Stack.Navigator>
  );
}
