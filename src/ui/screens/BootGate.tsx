/**
 * `BootGate` — splash + initialization decision screen.
 *
 * Spec reference: 06 §3 (Boot flow), task P1.E3.T12, 02 §4.1 (boot sequence).
 *
 * On mount:
 *   1. Initialize i18n (`initI18n()`)
 *   2. Initialize audio (`initAudio()`)
 *   3. Open DB (`openDatabase()` — runs migrations internally)
 *
 * While initializing: render a splash (Olympian wordmark + spinner).
 *
 * Once initialization succeeds: navigate to `LanguagePicker` if no locale
 * has been explicitly chosen yet, otherwise navigate to `Title`. On
 * failure, render a minimal error message instead of crashing.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { initAudio } from '@/platform/audio';
import { openDatabase } from '@/platform/storage/sqlite';
import { mmkv } from '@/platform/storage/mmkv';
import { initI18n } from '@/i18n';
import { applyRTL } from '@/i18n/applyRTL';
import { logger } from '@/shared/log';
import { colors, spacing } from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** MMKV key for the persisted locale (mirrors `@/platform/storage/mmkv`). */
const LOCALE_KEY = 'settings.locale';

/** Props accepted by {@link BootGate}. */
export type BootGateProps = RootStackScreenProps<'Boot'>;

/** Splash state machine. */
type BootState =
  | { status: 'initializing' }
  | { status: 'ready'; hasLocale: boolean }
  | { status: 'error'; message: string };

/**
 * Boot gate component. Renders the splash during initialization, then
 * navigates to the next screen.
 */
export function BootGate(_props: BootGateProps): React.JSX.Element {
  const navigation = useNavigation<RootStackScreenProps<'Boot'>['navigation']>();
  const [state, setState] = React.useState<BootState>({ status: 'initializing' });

  React.useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        // Run all three initializations concurrently. Each is idempotent.
        // Failures are caught individually — a missing audio init must not
        // block the i18n init, for instance.
        const results = await Promise.allSettled([
          initI18n(),
          initAudio(),
          openDatabase(),
        ]);

        if (cancelled) return;

        // Log any failures but don't crash — the app should still boot
        // into a degraded state if audio or DB fails.
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const label = ['i18n', 'audio', 'sqlite'][i];
            logger.warn(`[boot] ${label} init failed`, r.reason);
          }
        });

        // Did the DB init fail? If so we can still boot, but flag it.
        const dbFailed = results[2]?.status === 'rejected';
        if (dbFailed) {
          logger.warn('[boot] DB init failed — continuing in degraded mode');
        }

        // Decide which screen to show next based on whether the user has
        // explicitly chosen a locale.
        const hasLocale = mmkv.contains(LOCALE_KEY);
        if (hasLocale) {
          // Apply RTL based on the persisted locale so the next paint is
          // already in the correct direction.
          applyRTL(mmkv.getString(LOCALE_KEY) ?? 'en');
        }

        if (cancelled) return;
        setState({ status: 'ready', hasLocale });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        logger.error('[boot] init failed', e);
        setState({ status: 'error', message });
      }
    }

    // Fire-and-forget — failures are caught inside `init()` and surfaced
    // via the React state machine.
    init().catch(() => {
      // already handled inside init()
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the state flips to 'ready', navigate to the next screen.
  React.useEffect(() => {
    if (state.status !== 'ready') return;
    const nextScreen = state.hasLocale ? 'Title' : 'LanguagePicker';
    // `reset` rather than `navigate` so the Boot screen is removed from
    // the back stack (the user can't go back to the splash).
    navigation.reset({
      index: 0,
      routes: [{ name: nextScreen }],
    });
  }, [state, navigation]);

  return (
    <View testID="boot-gate" style={styles.container}>
      <View style={styles.logo}>
        <Text variant="display" scale="md" color="primary" align="center">
          OLYMPIAN
        </Text>
        <Text variant="caption" scale="md" color="textMuted" align="center">
          The Twelve Labors
        </Text>
      </View>
      <View style={styles.spinner}>
        {state.status === 'error' ? (
          <Text variant="body" scale="sm" color="danger" align="center">
            Initialization failed. {state.message}
          </Text>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
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
    padding: spacing.xl6,
  },
  logo: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  spinner: {
    marginTop: spacing.xl6,
  },
});
