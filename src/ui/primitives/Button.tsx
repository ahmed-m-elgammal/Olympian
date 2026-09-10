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
  Platform,
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

/** Resolve a button height from its size. */
function resolveHeight(size: ButtonSize): number {
  switch (size) {
    case 'small':
      return sizing.buttonHeightSm;
    case 'medium':
      return sizing.buttonHeightMd;
    case 'large':
      return sizing.buttonHeightLg;
  }
}

/** Per-variant resolved style: bg, fg, border. */
interface VariantStyle {
  readonly background: string;
  readonly foreground: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
}

function resolveVariantStyle(variant: ButtonVariant): VariantStyle {
  switch (variant) {
    case 'primary':
      return {
        background: colors.primary,
        foreground: colors.textInverted,
        borderColor: colors.primaryDark,
        borderWidth: sizing.borderWidth,
      };
    case 'secondary':
      return {
        background: colors.secondary,
        foreground: colors.textInverted,
        borderColor: colors.secondaryDark,
        borderWidth: sizing.borderWidth,
      };
    case 'ghost':
      return {
        background: 'transparent',
        foreground: colors.text,
        borderColor: colors.border,
        borderWidth: sizing.borderWidth,
      };
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
  const height = resolveHeight(size);

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
        {
          height,
          backgroundColor: variantStyle.background,
          borderColor: variantStyle.borderColor,
          borderWidth: variantStyle.borderWidth ?? 0,
          borderRadius: sizing.radiusMd,
          opacity: disabled ? 0.4 : 1,
        },
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
    // iOS shadow + Android elevation for primary/secondary variants (ghost
    // has transparent bg so the shadow is invisible — fine).
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
      default: {} as Record<string, unknown>,
    }),
  },
  contentWrap: {
    flex: 0, // shrink-to-fit the inner content; outer Pressable centers it
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
