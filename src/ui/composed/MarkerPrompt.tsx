/**
 * `MarkerPrompt` — the walk-over "enter" affordance (P2.E2.T4).
 *
 * A floating chip docked above the bottom safe area that appears when
 * the `MarkerSystem` focuses a marker: the marker's i18n name plus a
 * tap hint. Pressing it (or tapping the canvas — the screens wire both
 * to the same handler) enters the marker's target.
 *
 * Entrance/exit animate with Reanimated (fade + slide); the whole thing
 * is tokenized (spacing/colors/typography/radii) and RTL-aware — the
 * content row flips with the reading direction while the dock stays
 * centered.
 *
 * @packageDocumentation
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useRTL } from '@/ui/navigation/rtlHooks';
import { Icon } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';
import { colors, shadows, sizing, spacing } from '@/ui/theme';
import type { FocusedMarker } from '@/game/engine';

/** Icon per marker kind (from the primitive icon catalog). */
const KIND_ICONS: Readonly<Record<FocusedMarker['kind'], string>> = {
  puzzle: 'map',
  boss: 'skull',
  portal: 'compass',
};

/** Icon color token per marker kind (gold trail, danger boss, info portal). */
const KIND_ICON_COLORS: Readonly<Record<FocusedMarker['kind'], keyof typeof colors>> = {
  puzzle: 'primary',
  boss: 'danger',
  portal: 'secondary',
};

/** Props for {@link MarkerPrompt}. */
export interface MarkerPromptProps {
  /** The focused marker, or null (hidden). */
  readonly marker: FocusedMarker | null;
  /** Enter pressed. */
  readonly onEnter: (marker: FocusedMarker) => void;
  /** Bottom offset from the safe area (the joystick docks beside it). */
  readonly bottomOffset: number;
}

/** Animated entrance value. */
const ENTER_MS = 180;

// Reanimated's `Animated.View` style prop type triggers TS2589 with
// non-trivial animated styles — same simplification as `<Joystick>`.
const AnimatedView = Animated.View as unknown as React.FC<{
  style?: object;
  children?: React.ReactNode;
}>;

/**
 * The floating enter prompt. Render nothing meaningful when `marker`
 * is null (the chip animates out and stays non-interactive).
 */
export function MarkerPrompt({
  marker,
  onEnter,
  bottomOffset,
}: MarkerPromptProps): React.JSX.Element {
  const { t } = useTranslation('ui');
  const rtl = useRTL();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(marker ? 1 : 0, {
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [marker, progress]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  // Marker labelKeys are fully-qualified "ns:key" references resolved
  // by i18next's namespace separator. The TFunction's resource-typed
  // overload chokes on arbitrary-string keys (TS2589), so the call is
  // narrowed to the string-keyed shape with a safe default.
  const translateLoose = t as (key: string, options?: { defaultValue?: string }) => string;
  const name = marker ? translateLoose(marker.labelKey, { defaultValue: marker.markerId }) : '';
  const hint = t('overworld.tap_to_enter');

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: bottomOffset }]}>
      <AnimatedView style={chipStyle}>
        <Pressable
          onPress={() => marker && onEnter(marker)}
          disabled={!marker}
          accessibilityRole="button"
          accessibilityLabel={name ? `${name}. ${hint}` : hint}
          accessibilityState={{ disabled: !marker }}
          style={({ pressed }) => [
            styles.chip,
            shadowSpread,
            pressed && styles.chipPressed,
          ]}
          testID="marker-prompt"
        >
          <View style={rtl && styles.rowRtl}>
            {marker ? (
              <Icon
                name={KIND_ICONS[marker.kind]}
                size="sm"
                color={KIND_ICON_COLORS[marker.kind]}
              />
            ) : null}
            <View style={styles.labels}>
              <Text variant="body" scale="sm" color="text" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" scale="sm" color="textMuted" numberOfLines={1}>
                {hint}
              </Text>
            </View>
          </View>
        </Pressable>
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: sizing.radiusMd,
    borderWidth: sizing.borderWidth,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 200,
    maxWidth: 320,
  },
  chipPressed: {
    backgroundColor: colors.primaryMuted,
  },
  rowRtl: {
    flexDirection: 'row-reverse',
  },
  labels: {
    flexShrink: 1,
    marginHorizontal: spacing.sm,
    gap: 2,
  },
});

/** Shadow preset flattened into a style object (tokens are not styles). */
const shadowSpread = {
  shadowColor: shadows[4].shadowColor,
  shadowOpacity: shadows[4].shadowOpacity,
  shadowRadius: shadows[4].shadowRadius,
  shadowOffset: shadows[4].shadowOffset,
  elevation: shadows[4].elevation,
};

export default MarkerPrompt;
