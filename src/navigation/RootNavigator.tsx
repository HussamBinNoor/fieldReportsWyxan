import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateReportScreen } from '../screens/CreateReportScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ReportDetailScreen } from '../screens/ReportDetailScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ServerReportsScreen } from '../screens/ServerReportsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme/theme';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.ink, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      }}>
      <Tabs.Screen name="Home" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tabs.Screen name="Reports" component={ReportsScreen} options={{ title: 'My reports' }} />
      <Tabs.Screen name="Server" component={ServerReportsScreen} options={{ title: 'Server' }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: 'Diagnostics' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.ink, fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="CreateReport" component={CreateReportScreen} options={{ title: 'New report' }} />
        <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: 'Report' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
