/**
 * Root navigator + navigation types for the Olympian app.
 *
 * Spec reference: 06 §1 (Navigator tree), task P1.E3.T11.
 *
 * Stack shape (Phase 1–2 — the screens needed for boot → hub → play;
 * the full Onboarding/SaveSelect/Main split lands with the save
 * system):
 *
 *   RootStack (NativeStack)
 *   ├── Boot            — splash + init decision (BootGate)
 *   ├── LanguagePicker  — first-launch language picker
 *   ├── Title           — placeholder logo + menu
 *   ├── Settings        — audio / language / accessibility
 *   ├── Hub             — hub town (Depart to the Act overworld)
 *   ├── Overworld       — Act overworld map (params: act)
 *   └── Level           — puzzle room (params: levelId)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type {
  NativeStackNavigationOptions,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { colors } from '@/ui/theme';
import { BootGate } from '@/ui/screens/BootGate';
import { LanguagePickerScreen } from '@/ui/screens/LanguagePickerScreen';
import { TitleScreen } from '@/ui/screens/TitleScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { HubScreen } from '@/ui/screens/HubScreen';
import { OverworldScreen } from '@/ui/screens/OverworldScreen';
import { LevelScreen } from '@/ui/screens/LevelScreen';

/**
 * Root stack param list — the type-safe contract for every screen.
 * Overworld/Level params follow spec 06 §1.
 */
export type RootStackParamList = {
  Boot: undefined;
  LanguagePicker: undefined;
  Title: undefined;
  Settings: undefined;
  Hub: undefined;
  Overworld: { act: number };
  Level: { levelId: string };
};

/**
 * Per-screen props type. Screens receive this via their props
 * (or via `useNavigation<RootStackProp>()`).
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Default screen options for the native stack. Dark background + light
 * text matches the game's overall theme.
 */
const screenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  headerBackVisible: false,
};

/**
 * The root navigator. Mounts a `NavigationContainer` + the native stack.
 *
 * Renders the {@link BootGate} as the initial screen — it decides which
 * screen to navigate to next (LanguagePicker or Title).
 */
export function RootNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Boot"
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="Boot"
          component={BootGate}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="LanguagePicker"
          component={LanguagePickerScreen}
          options={{ headerShown: false, title: 'Language' }}
        />
        <Stack.Screen
          name="Title"
          component={TitleScreen}
          options={{ headerShown: false, title: 'Olympian' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="Hub"
          component={HubScreen}
          options={{ headerShown: false, title: 'Hub' }}
        />
        <Stack.Screen
          name="Overworld"
          component={OverworldScreen}
          options={{ headerShown: false, title: 'Overworld' }}
        />
        <Stack.Screen
          name="Level"
          component={LevelScreen}
          options={{ headerShown: false, title: 'Level' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
