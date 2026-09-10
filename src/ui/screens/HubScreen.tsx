/**
 * `HubScreen` — the home base for an Act (spec 06 §2.6, P2.E2.T6).
 *
 * Layout per the spec's wireframe: a current-act header, the 2×2 action
 * grid (Temple / Party / Relics / Settings), and the big Depart button
 * that walks into the Act 1 overworld (`Overworld` route, spec 07 §5.1
 * step 2). Settings is a real route; the other three tiles toast until
 * their epics land (save/party/relic UI are later phases).
 *
 * All copy is i18n-keyed (`ui.hub.*`); the act title comes from the
 * acts namespace via the current act constant.
 *
 * @packageDocumentation
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRTL } from '@/ui/navigation/rtlHooks';
import { toast } from '@/ui/composed';
import { Icon } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';
import { Button } from '@/ui/primitives/Button';
import { colors, shadows, sizing, spacing } from '@/ui/theme';
import type { ColorKey } from '@/ui/theme';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link HubScreen}. */
export type HubScreenProps = RootStackScreenProps<'Hub'>;

/** The hub's current act (Act 0 — the Nemean Lion, per the seed data). */
const HUB_ACT = 0;
/** i18n key of the current act's title (acts namespace). */
const HUB_ACT_TITLE_KEY = 'acts:act_0.title';

/** One tile of the action grid. */
interface HubAction {
  /** i18n key (ui.hub.actions.*). */
  readonly labelKey: string;
  readonly icon: string;
  readonly iconColor: ColorKey;
  /** Where it goes, or null for "not built yet" (toasts). */
  readonly route: 'Settings' | null;
}

/** The 2×2 grid per spec 06 §2.6 (order reads RTL-aware at render). */
const ACTIONS: readonly [HubAction, HubAction, HubAction, HubAction] = [
  { labelKey: 'hub.actions.temple', icon: 'holy', iconColor: 'primary', route: null },
  { labelKey: 'hub.actions.party', icon: 'shield', iconColor: 'secondary', route: null },
  { labelKey: 'hub.actions.relics', icon: 'relic', iconColor: 'rarityLegendary', route: null },
  { labelKey: 'hub.actions.settings', icon: 'settings', iconColor: 'textMuted', route: 'Settings' },
];

/**
 * The hub town home screen: act header, action grid, Depart button.
 */
export function HubScreen({ navigation }: HubScreenProps): React.JSX.Element {
  const { t } = useTranslation(['ui', 'acts', 'common']);
  const insets = useSafeAreaInsets();
  const rtl = useRTL();

  const pressAction = useCallback(
    (action: HubAction) => {
      if (action.route === 'Settings') {
        navigation.navigate('Settings');
        return;
      }
      toast(t('hub.actions.coming_soon'), { variant: 'info' });
    },
    [navigation, t],
  );

  const depart = useCallback(() => {
    navigation.navigate('Overworld', { act: HUB_ACT });
  }, [navigation]);

  return (
    <View
      testID="hub-screen"
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.xl3,
          paddingBottom: insets.bottom + spacing.xl4,
        },
      ]}
    >
      {/* Act header */}
      <View style={styles.header}>
        <Text variant="display" scale="md" color="primary" align="center">
          {t(HUB_ACT_TITLE_KEY)}
        </Text>
        <Text variant="body" scale="sm" color="textMuted" align="center">
          {t('hub.subtitle')}
        </Text>
      </View>

      {/* Action grid (2×2) — row direction flips with the reading flow */}
      <View style={[styles.grid, rtl && styles.gridRtl]}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.labelKey}
            onPress={() => pressAction(action)}
            style={({ pressed }) => [styles.tile, shadows[2], pressed && styles.tilePressed]}
            accessibilityRole="button"
            accessibilityLabel={t(action.labelKey)}
            testID={`hub-action-${action.labelKey.split('.').pop()}`}
          >
            <Icon name={action.icon} size="lg" color={action.iconColor} />
            <Text variant="body" scale="sm" color="text">
              {t(action.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Depart — the spec's big button */}
      <View style={styles.departDock}>
        <Button
          label={t('hub.depart')}
          icon="map"
          variant="primary"
          size="large"
          onPress={depart}
          testID="hub-depart"
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
    justifyContent: 'center',
    paddingHorizontal: spacing.xl4,
    gap: spacing.xl4,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  gridRtl: {
    flexDirection: 'row-reverse',
  },
  tile: {
    width: 132,
    height: 104,
    borderRadius: sizing.radiusLg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tilePressed: {
    backgroundColor: colors.primaryMuted,
  },
  departDock: {
    alignItems: 'center',
    minWidth: 220,
  },
});

export default HubScreen;
