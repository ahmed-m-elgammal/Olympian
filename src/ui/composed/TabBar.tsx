/**
 * `<TabBar>` — horizontal tabs with active indicator.
 *
 * Spec reference: 05 §4.3 (TabBar), task P1.E3.T10.
 *
 * Renders a row of tabs. The active tab is highlighted with the primary
 * brand color and an underline indicator.
 *
 * Layout uses `flexDirection: 'row'` so tab order mirrors in RTL — the
 * first tab is rendered at the start edge (left in LTR, right in RTL).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  colors,
  sizing,
  spacing,
  type ColorKey,
} from '@/ui/theme';
import { Icon, type IconName } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';

/** A single tab definition. */
export interface TabDef {
  /** Icon name (placeholder registry). */
  iconKey: IconName;
  /** Tab label (already translated by the caller). */
  labelKey: string;
  /** Optional numeric badge — when > 0, rendered next to the label. */
  badge?: number;
}

/** Props accepted by {@link TabBar}. */
export interface TabBarProps {
  /** Tab list. */
  tabs: TabDef[];
  /** Index of the currently-active tab. */
  activeIndex: number;
  /** Called when the user taps a tab. */
  onChange: (index: number) => void;
  /** Test ID. */
  testID?: string;
}

/**
 * Render a horizontal tab bar. The active tab uses `colors.primary` for
 * both the label and the underline indicator.
 */
export function TabBar({
  tabs,
  activeIndex,
  onChange,
  testID,
}: TabBarProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      style={styles.container}
      accessibilityRole="tablist"
    >
      {tabs.map((tab, index) => {
        const active = index === activeIndex;
        const labelColor: ColorKey = active ? 'primary' : 'textMuted';
        return (
          <Pressable
            key={`${tab.iconKey}-${tab.labelKey}-${index}`}
            style={styles.tab}
            onPress={() => onChange(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.labelKey}
          >
            <View style={styles.tabContent}>
              <Icon
                name={tab.iconKey}
                size="sm"
                color={labelColor}
              />
              <Text
                variant="label"
                scale="md"
                color={labelColor}
                weight={active ? 'bold' : 'normal'}
              >
                {tab.labelKey}
              </Text>
              {tab.badge !== undefined && tab.badge > 0 ? (
                <View style={styles.badge}>
                  <Text
                    variant="caption"
                    scale="sm"
                    color="textInverted"
                    weight="bold"
                  >
                    {tab.badge > 99 ? '99+' : String(tab.badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            {active ? <View style={styles.indicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: sizing.borderWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    minWidth: sizing.iconSm,
    height: sizing.iconSm,
    paddingHorizontal: spacing.xs,
    borderRadius: sizing.iconSm / 2,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: sizing.borderWidthFocus,
    backgroundColor: colors.primary,
  },
});
