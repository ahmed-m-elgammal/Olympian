/**
 * `<Icon>` primitive — sprite atlas lookup with placeholder rendering.
 *
 * Spec reference: 05 §3.4 (Icon), task P1.E3.T6.
 *
 * The final implementation will render frames from `assets/sprites/atlas_ui_64.png`
 * via Skia `<Image>`. The atlas isn't authored yet, so this Phase 1
 * implementation renders a placeholder colored rounded square whose color
 * is looked up from {@link ICON_PLACEHOLDER_COLORS} by icon name. This
 * keeps the UI visually distinct (every icon name has its own color) and
 * avoids blocking other screens that depend on `<Icon>`.
 *
 * When the real atlas lands, only this file's body changes — the public
 * API (`name`, `size`, `color`) stays the same.
 */

import React from 'react';
import {
  StyleSheet,
  Text as RNText,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, sizing, fontWeight as weightTokens, type ColorKey } from '@/ui/theme';

/** Icon size token names. */
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Catalog of icon names — a subset of the full catalog in spec 05 §6.2
 * (~80 icons). The full set will be supported once the sprite atlas lands.
 *
 * Each name maps to a placeholder color so icons are visually distinct in
 * Phase 1.
 */
export const ICON_PLACEHOLDER_COLORS: Record<string, ColorKey> = {
  // UI controls
  close: 'danger',
  check: 'success',
  chevron_start: 'textMuted',
  chevron_end: 'textMuted',
  chevron_up: 'textMuted',
  chevron_down: 'textMuted',
  plus: 'success',
  minus: 'danger',
  search: 'secondary',
  settings: 'textMuted',
  pause: 'warning',
  play: 'success',
  sound_on: 'text',
  sound_off: 'textMuted',
  music_on: 'primary',
  music_off: 'primaryMuted',
  language: 'secondary',
  back: 'textMuted',
  info: 'secondary',
  warning: 'warning',
  error: 'danger',

  // Stars / hearts
  star_filled: 'rarityLegendary',
  star_empty: 'textMuted',
  heart: 'hp',

  // Potions / items
  potion_red: 'hp',
  potion_blue: 'mp',
  potion_green: 'success',
  gold_coin: 'rarityLegendary',
  gem: 'secondary',
  key: 'warning',
  chest: 'rarityLegendary',
  scroll: 'text',

  // Weapons / armor
  sword: 'text',
  shield: 'secondary',
  bow: 'success',
  staff: 'rarityEpic',
  helm: 'textMuted',
  body_armor: 'textMuted',
  ring: 'rarityRare',
  trinket: 'rarityEpic',
  relic: 'rarityLegendary',

  // Combat actions
  attack: 'hp',
  defend: 'secondary',
  magic: 'rarityEpic',
  flee: 'warning',
  item_use: 'success',
  special: 'rarityLegendary',
  lightning: 'warning',
  fire: 'danger',
  ice: 'secondary',
  poison: 'success',
  holy: 'rarityLegendary',
  shadow: 'textMuted',
  light: 'warning',

  // Locks / navigation
  lock: 'textMuted',
  unlock: 'success',
  compass: 'secondary',
  map: 'rarityRare',
  boot: 'textMuted',
  wing: 'secondary',
  eye: 'text',
  hand: 'text',
  skull: 'textMuted',
};

/**
 * Icon name type. Any string is accepted (so callers can pass ad-hoc icon
 * names without TypeScript complaints) — unknown names fall back to the
 * default `'text'` color.
 */
export type IconName = string;

/** Props accepted by {@link Icon}. */
export interface IconProps {
  /** Icon name from the catalog (spec 05 §6.2). */
  name: IconName;
  /** Icon size token. Default `'md'`. */
  size?: IconSize;
  /**
   * Optional color override (token name). When omitted, the icon's
   * registered placeholder color is used.
   */
  color?: ColorKey;
  /** Test ID for the underlying View. */
  testID?: string;
}

/**
 * Look up the placeholder color for an icon name. Falls back to `'text'`
 * (the primary text color) when the name is not in the registry.
 */
export function getIconColor(name: string): ColorKey {
  return ICON_PLACEHOLDER_COLORS[name] ?? 'text';
}

/**
 * Render an icon. In Phase 1, this is a colored rounded square with a
 * single-letter glyph derived from the icon name (e.g., `'sword'` → `'S'`).
 * The size and color resolve from design tokens.
 *
 * The API is stable: when the real sprite atlas lands, callers won't need
 * to change.
 */
export function Icon({
  name,
  size = 'md',
  color,
  testID,
}: IconProps): React.JSX.Element {
  const resolvedColorKey = color ?? getIconColor(name);
  const resolvedColor = colors[resolvedColorKey];

  const glyph = name.length > 0 ? name[0]!.toUpperCase() : '?';

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        GLYPH_SIZE_STYLES[size],
        { backgroundColor: resolvedColor },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`icon-${name}`}
    >
      {/* Render the first letter of the icon name as the placeholder glyph.
          Sized to be readable inside the smallest (16px) icons. */}
      <RNText style={[styles.glyph, GLYPH_TEXT_STYLES[size]]}>
        {glyph}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: colors.textInverted,
    fontWeight: weightTokens.bold,
    textAlign: 'center',
  },
  sizeSm: {
    width: sizing.iconSm,
    height: sizing.iconSm,
    borderRadius: sizing.radiusSm,
  },
  sizeMd: {
    width: sizing.iconMd,
    height: sizing.iconMd,
    borderRadius: sizing.radiusSm,
  },
  sizeLg: {
    width: sizing.iconLg,
    height: sizing.iconLg,
    borderRadius: sizing.radiusSm,
  },
  sizeXl: {
    width: sizing.iconXl,
    height: sizing.iconXl,
    borderRadius: sizing.radiusSm,
  },
  glyphSm: {
    fontSize: Math.max(8, Math.floor(sizing.iconSm * 0.55)),
    lineHeight: sizing.iconSm,
  },
  glyphMd: {
    fontSize: Math.max(8, Math.floor(sizing.iconMd * 0.55)),
    lineHeight: sizing.iconMd,
  },
  glyphLg: {
    fontSize: Math.max(8, Math.floor(sizing.iconLg * 0.55)),
    lineHeight: sizing.iconLg,
  },
  glyphXl: {
    fontSize: Math.max(8, Math.floor(sizing.iconXl * 0.55)),
    lineHeight: sizing.iconXl,
  },
});

/** Per-size container styles (static — selected by {@link IconSize}). */
const GLYPH_SIZE_STYLES: Record<IconSize, ViewStyle> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
  xl: styles.sizeXl,
};

/** Per-size glyph text styles (static — selected by {@link IconSize}). */
const GLYPH_TEXT_STYLES: Record<IconSize, TextStyle> = {
  sm: styles.glyphSm,
  md: styles.glyphMd,
  lg: styles.glyphLg,
  xl: styles.glyphXl,
};
