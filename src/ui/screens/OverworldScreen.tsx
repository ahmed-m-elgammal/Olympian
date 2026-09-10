/**
 * `OverworldScreen` — Phase 1 placeholder for the overworld map.
 *
 * Spec reference: 06 §2.7 (OverworldScreen), task P1.E3.T11.
 *
 * The real overworld uses Skia to render the tile map (see
 * `src/game/render/tiles/`). For Phase 1 we render a minimal placeholder
 * so the navigation tree recognizes the `Overworld` route.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link OverworldScreen}. */
export type OverworldScreenProps = RootStackScreenProps<'Overworld'>;

/**
 * Phase 1 overworld placeholder. The Skia canvas + joystick mount will
 * land in a future phase.
 */
export function OverworldScreen(_props: OverworldScreenProps): React.JSX.Element {
  return (
    <View testID="overworld-screen" style={styles.container}>
      <Text variant="display" scale="md" color="primary" align="center">
        Overworld
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
