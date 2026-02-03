import React, { useEffect, useState, createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { COLORS, SCREEN_NAMES } from '@utils/constants';
import { StorageService } from '@services/storage';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Screens
import HomeScreen from '@screens/HomeScreen';
import CameraScreen from '@screens/CameraScreen';
import ImageEditorScreen from '@screens/ImageEditorScreen';
import LibraryScreen from '@screens/LibraryScreen';
import SettingsScreen from '@screens/SettingsScreen';
import HelpScreen from '@screens/HelpScreen';
import ViewerScreen from '@screens/ViewerScreen';
import PhotoPickerScreen from '@screens/PhotoPickerScreen';
import FilePickerScreen from '@screens/FilePickerScreen';
import OnboardingScreen from '@screens/OnboardingScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Home Stack Navigator
const HomeStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
          color: COLORS.text,
        },
        headerTintColor: COLORS.primary,
      }}
    >
      <Stack.Screen
        name={SCREEN_NAMES.HOME}
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Scanner"
        component={CameraScreen}
        options={{
          title: 'Scan Sheet Music',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ImageEditor"
        component={ImageEditorScreen}
        options={{
          title: 'Edit Image',
        }}
      />
      <Stack.Screen
        name="Viewer"
        component={ViewerScreen}
        options={{
          title: 'Music Viewer',
        }}
      />
      <Stack.Screen
        name="PhotoPicker"
        component={PhotoPickerScreen}
        options={{
          title: 'Select from Photos',
        }}
      />
      <Stack.Screen
        name="FilePicker"
        component={FilePickerScreen}
        options={{
          title: 'Select Files',
        }}
      />
    </Stack.Navigator>
  );
};

// Library Stack Navigator
const LibraryStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
          color: COLORS.text,
        },
        headerTintColor: COLORS.primary,
      }}
    >
      <Stack.Screen
        name={SCREEN_NAMES.LIBRARY}
        component={LibraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LibraryViewer"
        component={ViewerScreen}
        options={{
          title: 'Music Viewer',
        }}
      />
    </Stack.Navigator>
  );
};

// Settings Stack Navigator
const SettingsStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
          color: COLORS.text,
        },
        headerTintColor: COLORS.primary,
      }}
    >
      <Stack.Screen
        name={SCREEN_NAMES.SETTINGS}
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
};

// Help Stack Navigator
const HelpStackNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
          color: COLORS.text,
        },
        headerTintColor: COLORS.primary,
      }}
    >
      <Stack.Screen
        name="HelpScreen"
        component={HelpScreen}
        options={{ title: 'Help' }}
      />
    </Stack.Navigator>
  );
};

// Bottom Tab Navigator
const BottomTabNavigator = () => {
  const [libraryCount, setLibraryCount] = useState(0);

  useEffect(() => {
    loadLibraryCount();
  }, []);

  const loadLibraryCount = async () => {
    try {
      const items = await StorageService.getScannedItems();
      setLibraryCount(items.length);
    } catch (error) {
      console.error('Error loading library count:', error);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={() => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={90} style={StyleSheet.absoluteFill} />
        ),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
      })}
    >
      <Tab.Screen
        name="HomeStack"
        component={HomeStackNavigator}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="LibraryStack"
        component={LibraryStackNavigator}
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="music-box" size={size} color={color} />
          ),
          tabBarBadge: libraryCount > 0 ? libraryCount : undefined,
        }}
        listeners={() => ({
          tabPress: async () => {
            const items = await StorageService.getScannedItems();
            setLibraryCount(items.length);
          },
        })}
      />

      <Tab.Screen
        name="SettingsStack"
        component={SettingsStackNavigator}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="HelpStack"
        component={HelpStackNavigator}
        options={{
          title: 'Help',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="help-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Root Navigator
export const RootNavigator = () => {
  const colorScheme = useColorScheme();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
    // Set up interval to check onboarding status periodically
    const interval = setInterval(checkOnboardingStatus, 500);
    return () => clearInterval(interval);
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await StorageService.getPreference('onboardingComplete');
      setOnboardingComplete(completed === true);
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      // Default to showing onboarding if we can't read preference
      setOnboardingComplete(false);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null; // Or a splash screen
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <NavigationContainer>
          {!onboardingComplete ? (
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
              }}
            >
              <Stack.Screen
                name="Onboarding"
                component={OnboardingScreen}
              />
            </Stack.Navigator>
          ) : (
            <BottomTabNavigator />
          )}
        </NavigationContainer>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  tabBarIcon: {
    marginBottom: 2,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default RootNavigator;
