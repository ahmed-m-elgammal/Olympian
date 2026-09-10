/**
 * `HubScreen` — Phase 1 placeholder for the hub town.
 *
 * Spec reference: 06 §2.6 (HubScreen), task P1.E3.T11.
 *
 * The full hub UI (temple / party / relics / depart buttons, top bar with
 * hero stats) is owned by a later phase. For Phase 1 we render a minimal
 * placeholder so the navigation tree (`Title → Hub`) works end-to-end.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link HubScreen}. */
export type HubScreenProps = RootStackScreenProps<'Hub'>;

/**
 * Phase 1 hub placeholder. Shows the screen title + a subtitle explaining
 * the rest of the UI is coming later.
 */
export function HubScreen(_props: HubScreenProps): React.JSX.Element {
  return (
    <View testID="hub-screen" style={styles.container}>
      <Text variant="display" scale="md" color="primary" align="center">
        Hub Town
      </Text>
      <Text variant="body" scale="md" color="textMuted" align="center">
        Coming in a future phase.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl5,
    gap: spacing.md,
  },
});
