import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Feather from '@react-native-vector-icons/feather/static';
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

type TabIconProps = { color: string; size: number };

const iconStyle = { includeFontPadding: false, textAlignVertical: 'center' } as const;

function HomeTabIcon({ color, size }: TabIconProps) {
  return <Feather name="home" color={color} size={size} style={iconStyle} />;
}

function ReportsTabIcon({ color, size }: TabIconProps) {
  return <Feather name="file-text" color={color} size={size} style={iconStyle} />;
}

function ServerTabIcon({ color, size }: TabIconProps) {
  return <Feather name="server" color={color} size={size} style={iconStyle} />;
}

function DiagnosticsTabIcon({ color, size }: TabIconProps) {
  return <Feather name="sliders" color={color} size={size} style={iconStyle} />;
}

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.ink, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      }}>
      <Tabs.Screen
        name="Home"
        component={DashboardScreen}
        options={{ title: 'Home', tabBarIcon: HomeTabIcon }}
      />
      <Tabs.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: 'My reports', tabBarIcon: ReportsTabIcon }}
      />
      <Tabs.Screen
        name="Server"
        component={ServerReportsScreen}
        options={{ title: 'Server', tabBarIcon: ServerTabIcon }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Diagnostics', tabBarIcon: DiagnosticsTabIcon }}
      />
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
