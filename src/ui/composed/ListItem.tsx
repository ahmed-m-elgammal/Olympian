/**
 * `<ListItem>` — left icon, title, subtitle, right chevron.
 *
 * Spec reference: 05 §4.2 (ListItem), task P1.E3.T10.
 *
 * Used for inventory rows, settings rows, save slot rows, etc.
 *
 * Layout:
 *   [icon] [title/subtitle column] ...... [trailingText] [chevron_end]
 *
 * Uses logical (`flexDirection: 'row'`) layout so it mirrors in RTL
 * automatically (spec 10 §4.2).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, sizing, spacing } from '@/ui/theme';
import { Icon, type IconName } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';
import { View as TView } from '@/ui/primitives/View';

/** Props accepted by {@link ListItem}. */
export interface ListItemProps {
  /** Optional icon rendered at the start of the row. */
  iconStart?: IconName;
  /** Title text. */
  title: string;
  /** Optional subtitle rendered below the title. */
  subtitle?: string;
  /** Optional trailing text (e.g., "×5" for a stack count). */
  trailingText?: string;
  /** Tap handler — when set, the row becomes tappable. */
  onPress?: () => void;
  /** Disable interaction. */
  disabled?: boolean;
  /** Test ID. */
  testID?: string;
}

/**
 * Render a list row. When `onPress` is set, wraps in a Pressable; otherwise
 * renders a plain View.
 */
export function ListItem({
  iconStart,
  title,
  subtitle,
  trailingText,
  onPress,
  disabled = false,
  testID,
}: ListItemProps): React.JSX.Element {
  const row = (
    <TView
      testID={testID}
      padding="md"
      style={[styles.row, disabled ? styles.rowDisabled : undefined]}
    >
      {iconStart ? (
        <Icon name={iconStart} size="md" />
      ) : (
        // Reserve space so rows with and without icons align.
        <View style={styles.iconPlaceholder} />
      )}

      <View style={styles.textColumn}>
        <Text variant="body" scale="md" color="text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            scale="sm"
            color="textMuted"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailingText ? (
        <Text variant="label" scale="md" color="textMuted">
          {trailingText}
        </Text>
      ) : null}

      {onPress ? <Icon name="chevron_end" size="sm" color="textMuted" /> : null}
    </TView>
  );

  if (onPress) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => {
          if (!disabled) onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled }}
      >
        {({ pressed }) =>
          pressed ? (
            <View style={styles.rowPressed}>{row}</View>
          ) : (
            row
          )
        }
      </Pressable>
    );
  }

  return row;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: sizing.hairline,
    borderBottomColor: colors.border,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowPressed: {
    backgroundColor: colors.highlight10,
  },
  iconPlaceholder: {
    width: sizing.iconMd,
    height: sizing.iconMd,
  },
  textColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: spacing.xs,
  },
});
