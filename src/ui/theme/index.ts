/**
 * Theme barrel export — re-exports everything from `./tokens` plus the
 * `ThemeProvider` and `useTheme` hook.
 *
 * Import from `@/ui/theme` (this file). Do not import directly from
 * `./tokens` or `./ThemeProvider` in feature code.
 *
 * ```ts
 * import { useTheme, tokens, colors } from '@/ui/theme';
 * ```
 */

export {
  tokens,
  spacing,
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  typography,
  sizing,
  shadows,
  zIndex,
  durations,
  resolveRadius,
} from './tokens';

export type {
  ThemeTokens,
  SpacingKey,
  ColorKey,
  FontFamilyKey,
  FontSizeKey,
  FontWeightKey,
  LineHeightKey,
  TextVariant,
  TextScale,
  TypographyPreset,
  SizingKey,
  RadiusKey,
  ShadowPreset,
  ElevationKey,
  ZIndexKey,
  DurationKey,
} from './tokens';

export { ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeName, ThemeContextValue, ThemeProviderProps } from './ThemeProvider';
