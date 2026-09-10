/**
 * `<Button>` primitive.
 *
 * Spec reference: 05 §3.3 (Button), task P1.E3.T5.
 *
 * Three visual variants: `primary` (gold), `secondary` (blue), `ghost`
 * (transparent). Three sizes: `small` (32), `medium` (40), `large` (52).
 *
 * Behavior:
 *   - On press: fires `hapticLight()` and calls `onPress`.
 *   - On press-in: scales the content to 0.97 via Reanimated `withTiming`.
 *   - Loading state: shows a textual "…" suffix and disables press.
 *   - Disabled state: dims to 0.4 opacity and blocks press.
 *
 * All visual properties come from design tokens — no hardcoded colors.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { hapticLight } from '@/platform/haptics/haptics';
import {
  colors,
  durations,
  shadows,
  sizing,
  spacing,
  type ColorKey,
} from '@/ui/theme';
import { Icon, type IconName } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';

/** Visual style of the button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
/** Button size scale. */
export type ButtonSize = 'small' | 'medium' | 'large';

/** Props accepted by {@link Button}. */
export interface ButtonProps {
  /** Visible label. Required (per task spec). */
  label: string;
  /** Optional icon name rendered before the label. */
  icon?: IconName;
  /** Visual variant. Default `'primary'`. */
  variant?: ButtonVariant;
  /** Size scale. Default `'medium'`. */
  size?: ButtonSize;
  /** Disabled state — blocks press and dims to 0.4 opacity. */
  disabled?: boolean;
  /** Loading state — shows spinner, blocks press. */
  loading?: boolean;
  /** Tap handler. Called only when not disabled/loading. */
  onPress?: () => void;
  /** Optional accessibility hint (already auto-set from label). */
  accessibilityHint?: string;
  /** Override the testID. */
  testID?: string;
}

/** Per-variant resolved foreground color (text / icon / spinner). */
interface VariantStyle {
  readonly foreground: string;
}

function resolveVariantStyle(variant: ButtonVariant): VariantStyle {
  switch (variant) {
    case 'primary':
      return { foreground: colors.textInverted };
    case 'secondary':
      return { foreground: colors.textInverted };
    case 'ghost':
      return { foreground: colors.text };
  }
}

/**
 * Animated inner content wrapper. Uses Reanimated so the press scale runs on
 * the UI thread (no JS roundtrip per frame).
 */
function AnimatedContent({
  scale,
  children,
}: {
  scale: SharedValue<number>;
  children: React.ReactNode;
}): React.JSX.Element {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  // Reanimated's `Animated.View` has a deep `AnimateProps<ViewProps>` style
  // prop type that triggers TS2589 (excessive type instantiation) when
  // combined with a non-trivial `useAnimatedStyle` return. We cast the
  // component type to a simple `View`-like shape — the runtime behavior is
  // identical; only the TypeScript type is simplified.
  const AnimatedViewSimple = Animated.View as unknown as React.FC<{
    style?: ViewStyle | ViewStyle[];
    children?: React.ReactNode;
  }>;

  return (
    <AnimatedViewSimple style={animatedStyle as unknown as ViewStyle}>
      {children}
    </AnimatedViewSimple>
  );
}

/**
 * Button primitive. See {@link ButtonProps}.
 */
export function Button({
  label,
  icon,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  onPress,
  accessibilityHint,
  testID,
}: ButtonProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const variantStyle = resolveVariantStyle(variant);

  const handlePressIn = (): void => {
    scale.value = withTiming(0.97, { duration: durations.fast });
  };
  const handlePressOut = (): void => {
    scale.value = withTiming(1, { duration: durations.fast });
  };
  const handlePress = (): void => {
    if (disabled || loading) return;
    hapticLight();
    onPress?.();
  };

  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      accessible
      disabled={!isInteractive}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        styles[variant],
        SIZE_STYLES[size],
        disabled ? styles.disabled : null,
      ]}
    >
      <AnimatedContent scale={scale}>
        <View style={styles.innerRow}>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={variantStyle.foreground}
              style={styles.spinner}
            />
          ) : icon ? (
            <Icon name={icon} size={size === 'small' ? 'sm' : 'md'} color={variantStyle.foreground as ColorKey} />
          ) : null}
          <Text
            variant="label"
            scale={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md'}
            color={variantStyle.foreground as ColorKey}
            align="center"
            weight="bold"
          >
            {label}
          </Text>
        </View>
      </AnimatedContent>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: sizing.radiusMd,
    // iOS shadow + Android elevation from the elevation token (level 2).
    // Ghost has a transparent bg so the shadow is invisible — fine.
    shadowColor: shadows[2].shadowColor,
    shadowOpacity: shadows[2].shadowOpacity,
    shadowRadius: shadows[2].shadowRadius,
    shadowOffset: shadows[2].shadowOffset,
    elevation: shadows[2].elevation,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    borderWidth: sizing.borderWidth,
  },
  secondary: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondaryDark,
    borderWidth: sizing.borderWidth,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: sizing.borderWidth,
  },
  sizeSmall: {
    height: sizing.buttonHeightSm,
  },
  sizeMedium: {
    height: sizing.buttonHeightMd,
  },
  sizeLarge: {
    height: sizing.buttonHeightLg,
  },
  disabled: {
    opacity: 0.4,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  spinner: {
    marginEnd: spacing.xs,
  },
});

/** Per-size height styles (static — selected by {@link ButtonSize}). */
const SIZE_STYLES: Record<ButtonSize, ViewStyle> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};
