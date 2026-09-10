/**
 * `<StatBar>` — labeled bar for HP/MP/XP/etc.
 *
 * Spec reference: 05 §4.6 (StatBar), task P1.E3.T10.
 *
 * Renders a labeled progress bar with the current/max values shown next to
 * the label. Used by HUD, party panel, inventory item tooltips.
 *
 * Layout:
 *   ┌────────────────────────────────────┐
 *   │  Label                42 / 100      │
 *   │  [████████░░░░░░░░░░░░░░░░░░░░░░]   │
 *   └────────────────────────────────────┘
 *
 * Wraps {@link ProgressBar} (Reanimated-driven).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { sizing, spacing, type ColorKey } from '@/ui/theme';
import { ProgressBar } from '@/ui/primitives/ProgressBar';
import { Text } from '@/ui/primitives/Text';

/** Props accepted by {@link StatBar}. */
export interface StatBarProps {
  /** Label shown above the bar (e.g., "HP"). */
  label: string;
  /** Current value. */
  current: number;
  /** Maximum value (used to compute `current / max`). */
  max: number;
  /** Fill color token. Default `'primary'`. */
  color?: ColorKey;
  /** Bar height. Default `8`. */
  height?: number;
  /** Animate value transitions. Default `true`. */
  animated?: boolean;
  /** Test ID. */
  testID?: string;
}

/**
 * Render a labeled stat bar. The label sits at the start of the row; the
 * `current / max` value sits at the end (mirrored in RTL since the parent
 * uses logical flex).
 */
export function StatBar({
  label,
  current,
  max,
  color = 'primary',
  height = sizing.radiusMd,
  animated = true,
  testID,
}: StatBarProps): React.JSX.Element {
  const safeMax = max > 0 ? max : 1;
  const progress = Math.max(0, Math.min(1, current / safeMax));

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.header}>
        <Text variant="label" scale="sm" color="textMuted" weight="bold">
          {label}
        </Text>
        <Text variant="label" scale="sm" color="text">
          {current} / {max}
        </Text>
      </View>
      <ProgressBar
        progress={progress}
        color={color}
        height={height}
        animated={animated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
