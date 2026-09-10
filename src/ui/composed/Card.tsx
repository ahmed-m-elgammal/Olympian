/**
 * `<Card>` — composed surface with shadow, padding, radius.
 *
 * Spec reference: 05 §4.1 (Card), task P1.E3.T10.
 *
 * A Card is a raised surface (uses the `elevated` token from `<View>`)
 * with consistent padding, radius, and an optional title row.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import {
  colors,
  resolveRadius,
  spacing,
  type RadiusKey,
  type SpacingKey,
} from '@/ui/theme';
import { View } from '@/ui/primitives/View';
import { Text } from '@/ui/primitives/Text';

/** Card visual style. */
export type CardVariant = 'default' | 'elevated' | 'outlined';

/** Props accepted by {@link Card}. */
export interface CardProps {
  /** Optional title shown at the top of the card. */
  title?: string;
  /** Visual variant. Default `'default'`. */
  variant?: CardVariant;
  /** Inner padding token. Default `'lg'` (16). */
  padding?: SpacingKey;
  /** Corner radius token. Default `'lg'` (16). */
  radius?: RadiusKey;
  /** Tap handler — when set, the card becomes tappable. */
  onPress?: () => void;
  /** Disable the card's press interaction. */
  disabled?: boolean;
  /** Card content. */
  children?: React.ReactNode;
  /** Test ID. */
  testID?: string;
}

/**
 * Render a Card. When `onPress` is set, the surface wraps in a Pressable
 * for tap feedback. Otherwise it renders a plain View.
 */
export function Card({
  title,
  variant = 'default',
  padding = 'lg',
  radius = 'lg',
  onPress,
  disabled = false,
  children,
  testID,
}: CardProps): React.JSX.Element {
  const elevation: 0 | 1 | 2 | 4 | 8 =
    variant === 'elevated' ? 4 : variant === 'outlined' ? 0 : 2;
  // `outlined` variant has a transparent background so the border shows
  // against whatever's behind it. Other variants use `surfaceAlt`.
  const bg = variant === 'outlined' ? undefined : 'surfaceAlt';
  const outlined = variant === 'outlined';

  const inner = (
    <View
      bg={bg}
      padding={padding}
      radius={radius}
      elevated={elevation}
      bordered={outlined}
      testID={testID}
    >
      {title ? (
        <Text variant="title" scale="sm" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => {
          if (!disabled) onPress();
        }}
        style={({ pressed }) => [
          styles.pressable,
          { opacity: disabled ? 0.4 : pressed ? 0.9 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={title ?? 'card'}
        accessibilityState={{ disabled }}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: resolveRadius('lg'),
  },
  title: {
    marginBottom: spacing.sm,
    color: colors.text,
  },
});
