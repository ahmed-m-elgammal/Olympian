/**
 * Root navigator + navigation types for the Olympian app.
 *
 * Spec reference: 06 §1 (Navigator tree), task P1.E3.T11.
 *
 * Stack shape (Phase 1 — only the screens needed for the boot → settings
 * flow are mounted; Hub/Overworld are placeholders until P1.E3.T11 is
 * exercised end-to-end):
 *
 *   RootStack (NativeStack)
 *   ├── Boot            — splash + init decision (BootGate)
 *   ├── LanguagePicker — first-launch language picker
 *   ├── Title          — placeholder logo + menu
 *   ├── Settings       — audio / language / accessibility
 *   ├── Hub            — hub town placeholder
 *   └── Overworld      — overworld map placeholder
 *
 * Future phases will split this into OnboardingStack / SaveSelectStack /
 * MainStack as described in spec 06 §1, but for Phase 1 a single flat
 * stack is enough to verify the navigation wiring.
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

/**
 * Root stack param list — the type-safe contract for every screen in the
 * Phase 1 navigation tree. Each entry is `[params | undefined]`.
 */
export type RootStackParamList = {
  Boot: undefined;
  LanguagePicker: undefined;
  Title: undefined;
  Settings: undefined;
  Hub: undefined;
  Overworld: undefined;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
