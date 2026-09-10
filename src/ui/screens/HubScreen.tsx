/**
 * `HubScreen` — Phase 1 placeholder for the hub town, plus the P2.E1
 * entry point into the playable demo glade.
 *
 * Spec reference: 06 §2.6 (HubScreen), task P1.E3.T11.
 *
 * The full hub UI (temple / party / relics / depart buttons, top bar with
 * hero stats) is owned by a later phase. For now the screen keeps the
 * placeholder layout and exposes one real action: walking into the
 * demo-glade overworld (`Overworld` route) where the hero, the
 * joystick, and the camera are playable (P2.E1 acceptance flow).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';
import { Button } from '@/ui/primitives/Button';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link HubScreen}. */
export type HubScreenProps = RootStackScreenProps<'Hub'>;

/**
 * Hub placeholder + demo-glade departure. All copy is i18n-keyed
 * (`ui.hub.*`); the button routes to the playable P2.E1 scene.
 */
export function HubScreen({ navigation }: HubScreenProps): React.JSX.Element {
  const { t } = useTranslation('ui');

  return (
    <View testID="hub-screen" style={styles.container}>
      <Text variant="display" scale="md" color="primary" align="center">
        {t('hub.title')}
      </Text>
      <Text variant="body" scale="md" color="textMuted" align="center">
        {t('hub.subtitle')}
      </Text>
      <Button
        label={t('hub.enter_glade')}
        icon="sword"
        variant="primary"
        size="large"
        onPress={() => navigation.navigate('Overworld')}
        testID="hub-enter-glade"
      />
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
    gap: spacing.lg,
  },
});
