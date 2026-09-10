/**
 * `TitleScreen` — placeholder logo + main menu buttons.
 *
 * Spec reference: 06 §2.2 (TitleScreen), task P1.E3.T14.
 *
 * Three buttons:
 *   - "Start Game" → navigates to `Hub` (placeholder Phase 1 hub)
 *   - "Settings"   → navigates to `Settings`
 *   - "Credits"    → shows a toast (no screen yet)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/ui/theme';
import { Button } from '@/ui/primitives/Button';
import { Text } from '@/ui/primitives/Text';
import { toast } from '@/ui/composed/Toast';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link TitleScreen}. */
export type TitleScreenProps = RootStackScreenProps<'Title'>;

/**
 * Title screen — animated logo (placeholder for the Skia animation) plus
 * three buttons.
 */
export function TitleScreen(_props: TitleScreenProps): React.JSX.Element {
  const navigation = useNavigation<RootStackScreenProps<'Title'>['navigation']>();
  const { t } = useTranslation();

  const handleStart = (): void => {
    navigation.navigate('Hub');
  };
  const handleSettings = (): void => {
    navigation.navigate('Settings');
  };
  const handleCredits = (): void => {
    toast(t('common:about'), { variant: 'info' });
  };

  return (
    <View testID="title-screen" style={styles.container}>
      <View style={styles.logo}>
        <Text variant="display" scale="lg" color="primary" align="center">
          OLYMPIAN
        </Text>
        <Text variant="title" scale="sm" color="textMuted" align="center">
          {t('ui:title.subtitle')}
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button
          testID="title-button-start"
          label={t('common:menu.start_game')}
          variant="primary"
          size="large"
          onPress={handleStart}
        />
        <Button
          testID="title-button-settings"
          label={t('common:menu.settings')}
          variant="secondary"
          size="medium"
          onPress={handleSettings}
        />
        <Button
          testID="title-button-credits"
          label={t('common:menu.credits')}
          variant="ghost"
          size="medium"
          onPress={handleCredits}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl5,
    paddingTop: spacing.xl6,
    paddingBottom: spacing.xl6,
  },
  logo: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl5,
  },
  buttons: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.md,
  },
});
