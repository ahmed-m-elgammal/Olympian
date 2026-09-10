/**
 * `<ProgressBar>` primitive — Reanimated-driven progress bar.
 *
 * Spec reference: 05 §3.7 (ProgressBar), task P1.E3.T9.
 *
 * Renders a track with an inner fill whose width is driven by a Reanimated
 * shared value. When `progress` changes, the fill animates to the new
 * value via `withTiming` (duration = `durations.medium`). Set `animated`
 * to `false` for instant updates (e.g., during a fast HP drain).
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  colors,
  durations,
  sizing,
  type ColorKey,
} from '@/ui/theme';

/** Props accepted by {@link ProgressBar}. */
export interface ProgressBarProps {
  /** Progress in the range 0..1. Clamped. */
  progress: number;
  /** Color token name for the fill. Default `'primary'`. */
  color?: ColorKey;
  /** Track height in pixels. Default `8`. */
  height?: number;
  /** Whether to animate transitions. Default `true`. */
  animated?: boolean;
  /** Test ID. */
  testID?: string;
}

/** Clamp a value into [0, 1]. */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Inner animated fill. Exists as a separate component so the
 * `useAnimatedStyle` only re-runs when the shared value updates — not on
 * every parent prop change.
 */
function AnimatedFill({
  widthFraction,
  color,
  height,
}: {
  widthFraction: SharedValue<number>;
  color: string;
  height: number;
}): React.JSX.Element {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.round(widthFraction.value * 1000) / 10}%` as unknown as number,
      height,
      backgroundColor: color,
    };
  });

  // Reanimated's `Animated.View` has a deep `AnimateProps<ViewProps>` style
  // prop type that triggers TS2589 (excessive type instantiation). Cast the
  // component to a simpler shape — runtime behavior is identical.
  const AnimatedViewSimple = Animated.View as unknown as React.FC<{
    style?: ViewStyle | ViewStyle[];
  }>;

  return <AnimatedViewSimple style={[styles.fill, animatedStyle as unknown as ViewStyle]} />;
}

/**
 * Render a progress bar. The track uses `colors.border` as its background
 * and the fill uses the resolved color token (default `colors.primary`).
 */
export function ProgressBar({
  progress,
  color = 'primary',
  height = sizing.radiusMd,
  animated = true,
  testID,
}: ProgressBarProps): React.JSX.Element {
  const clamped = clamp01(progress);
  const widthFraction = useSharedValue(clamped);

  // Update the shared value whenever the input `progress` prop changes.
  React.useEffect(() => {
    if (animated) {
      widthFraction.value = withTiming(clamped, { duration: durations.medium });
    } else {
      widthFraction.value = clamped;
    }
  }, [clamped, animated, widthFraction]);

  const fillColor = colors[color];

  return (
    <View
      testID={testID}
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="adjustable"
      accessibilityLabel="progress-bar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamped * 100),
      }}
    >
      <AnimatedFill
        widthFraction={widthFraction}
        color={fillColor}
        height={height}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    width: '0%',
  },
});
