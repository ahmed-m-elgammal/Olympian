/**
 * `LanguagePickerScreen` — first-launch language picker.
 *
 * Spec reference: 06 §2.1 (LanguagePickerScreen), task P1.E3.T13, 10 §4.1.
 *
 * Two large buttons (English / العربية). On tap:
 *   1. Persist the locale via `setLocale(locale)` (MMKV).
 *   2. Switch the active i18next language via `changeLocale(locale)`.
 *   3. Apply RTL via `applyRTL(locale)` — flips RN's layout direction.
 *   4. Navigate to `Title`.
 *
 * The user can also reach this screen from Settings (via the Language row).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import {
  availableLocales,
  changeLocale,
  type Locale,
} from '@/i18n';
import { applyRTL } from '@/i18n/applyRTL';
import { setLocale } from '@/platform/storage/mmkv';
import { colors, spacing } from '@/ui/theme';
import { Button } from '@/ui/primitives/Button';
import { Text } from '@/ui/primitives/Text';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Map locale → display label rendered on its button. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/** Props accepted by {@link LanguagePickerScreen}. */
export type LanguagePickerScreenProps = RootStackScreenProps<'LanguagePicker'>;

/**
 * Language picker screen. Two large buttons side-by-side (English / Arabic).
 */
export function LanguagePickerScreen(
  _props: LanguagePickerScreenProps,
): React.JSX.Element {
  const navigation = useNavigation<RootStackScreenProps<'LanguagePicker'>['navigation']>();
  const { t } = useTranslation();

  const handlePick = React.useCallback(
    (locale: Locale) => {
      // 1. Persist via MMKV.
      setLocale(locale);
      // 2. Switch active i18n language (also re-persists internally).
      changeLocale(locale)
        .then(() => {
          // 3. Apply RTL — flips RN's layout direction.
          applyRTL(locale);
          // 4. Navigate to Title. Reset so the user can't swipe back to
          //    the language picker.
          navigation.reset({ index: 0, routes: [{ name: 'Title' }] });
        })
        .catch(() => {
          // locale change failed — keep the user on the picker so they
          // can retry.
        });
    },
    [navigation],
  );

  return (
    <View testID="language-picker-screen" style={styles.container}>
      <View style={styles.header}>
        <Text variant="title" scale="lg" color="text" align="center">
          {t('common:language')}
        </Text>
        <Text variant="body" scale="md" color="textMuted" align="center">
          {t('ui:settings.language')}
        </Text>
      </View>

      <View style={styles.buttons}>
        {availableLocales.map((locale) => (
          <Button
            key={locale}
            testID={`locale-button-${locale}`}
            label={LOCALE_LABELS[locale]}
            variant="primary"
            size="large"
            onPress={() => {
              handlePick(locale);
            }}
          />
        ))}
      </View>
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
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl5,
  },
  buttons: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.md,
  },
});
