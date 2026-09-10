/**
 * Design tokens for the Olympian game.
 *
 * Spec reference: 05 §2 (Design tokens), 02 §3 (Layer 6: UI).
 *
 * Every visual property used by any UI component MUST reference one of these
 * tokens. Components must never hardcode colors, sizes, font weights, or
 * animation timings — that breaks theming, RTL, accessibility overrides,
 * and visual consistency. ESLint can't enforce this automatically, so it is
 * the responsibility of every UI author to only import from `@/ui/theme`.
 *
 * Token categories exported here:
 *   - {@link spacing}  — margin / padding / gap scale (steps of 4)
 *   - {@link colors}   — full palette (surfaces, text, rarity, biome, semantic)
 *   - {@link typography} — font families, size scale, weights, line heights
 *   - {@link sizing}   — touch targets, button heights, icon sizes, radii
 *   - {@link shadows}  — elevation levels (0, 1, 2, 4, 8)
 *   - {@link zIndex}   — paint-order layering
 *   - {@link durations} — animation timings (fast / medium / slow)
 *
 * The {@link tokens} aggregate is the single export most components consume
 * via `useTheme()`. Individual category exports are also available for
 * non-React callers (e.g., style utils).
 */

// ---------------------------------------------------------------------------
// Spacing (spec 05 §2.1)
// ---------------------------------------------------------------------------

/**
 * Spacing scale. Use `spacing[key]` for every `padding`, `margin`, and
 * `gap`. Keys are semantic (none, xs, sm, md, lg, xl, …) — never hardcode
 * a raw pixel value.
 *
 * Spec 05 §2.1 lists a slightly different scale (xxs/xs/sm/md/lg/xl/xxl/…);
 * task P1.E3.T1 specifies the concrete step values 0, 4, 8, 12, 16, 20, 24,
 * 32, 40, 48, 64. We follow the task spec exactly.
 */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xl2: 24,
  xl3: 32,
  xl4: 40,
  xl5: 48,
  xl6: 64,
} as const;

/** Valid spacing token keys. */
export type SpacingKey = keyof typeof spacing;

// ---------------------------------------------------------------------------
// Colors (spec 05 §2.2 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Color palette. Every color used by any UI component comes from here.
 *
 * The palette is grouped into semantic categories:
 *   - Surface/background colors (bg, surface, surfaceAlt)
 *   - Text colors (text, textMuted, textDisabled)
 *   - Brand colors (primary = gold, secondary = blue)
 *   - Status colors (success, warning, danger, info)
 *   - Resource colors (hp / mp / xp / stamina)
 *   - Rarity colors (common / rare / epic / legendary) — used by item gems
 *   - Biome colors (one per Act biome — used by minimap + world map)
 *   - Translucent overlays (for modals + focus highlights)
 *
 * Hex values match the task spec P1.E3.T1 (surface #0c0f1d / #1a1f2e,
 * text #e2d3a8 / #8da0b6).
 */
export const colors = {
  // ---- Surfaces / backgrounds ----
  bg: '#0c0f1d',
  surface: '#0c0f1d',
  surfaceAlt: '#1a1f2e',
  surfaceRaised: '#222842',
  border: '#2f3654',
  borderStrong: '#3f4668',

  // ---- Text ----
  text: '#e2d3a8',
  textMuted: '#8da0b6',
  textDisabled: '#5b6479',
  textInverted: '#0c0f1d',

  // ---- Brand ----
  primary: '#e8b34a', // gold (godly)
  primaryDark: '#a87a1f',
  primaryMuted: '#7a5a16',
  secondary: '#4a8cd0', // blue (divine)
  secondaryDark: '#2f5e8e',

  // ---- Status ----
  success: '#5cc472',
  warning: '#e8a23a',
  danger: '#d04848',
  info: '#4a8cd0',

  // ---- Resources ----
  hp: '#d04848',
  mp: '#4a8cd0',
  xp: '#5cc472',
  stamina: '#e8a23a',

  // ---- Rarity (item gems; spec 09 §3) ----
  rarityCommon: '#9aa6b8',
  rarityUncommon: '#5cc472',
  rarityRare: '#4a8cd0',
  rarityEpic: '#a05cd0',
  rarityLegendary: '#e8b34a',

  // ---- Biome colors (one per Act; used by minimap + overworld) ----
  biomePrologue: '#6b6f7a', // Act 0 — Nemean Valley (grey stone)
  biomeForest: '#3a6a3a', // Act 1 — Nemean Lion
  biomeSwamp: '#4a5a2a', // Act 2 — Lernaean Hydra
  biomeMountain: '#7a6a4a', // Act 3 — Ceryneian Hind
  biomeTundra: '#a8c0d8', // Act 4 — Erymanthian Boar
  biomeVolcano: '#c04020', // Act 5 — Augean Stables
  biomeSky: '#6a8cd0', // Act 6 — Stymphalian Birds
  biomeLabyrinth: '#5a3a6a', // Act 7 — Minotaur
  biomeDesert: '#d8b85a', // Act 8 — Amazons
  biomeRuins: '#8a7a5a', // Act 9 — Sphinx
  biomeSea: '#2a5a8a', // Act 10 — Sirens
  biomeUnderworld: '#2a1a3a', // Act 11 — Hades

  // ---- Translucent overlays ----
  overlay30: 'rgba(0,0,0,0.3)',
  overlay50: 'rgba(0,0,0,0.5)',
  overlay70: 'rgba(0,0,0,0.7)',
  highlight10: 'rgba(226,211,168,0.10)',
  highlight20: 'rgba(226,211,168,0.20)',
} as const;

/** Valid color token keys (e.g., `'primary'`, `'surface'`, `'textMuted'`). */
export type ColorKey = keyof typeof colors;

// ---------------------------------------------------------------------------
// Typography (spec 05 §2.3 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Font families. Task P1.E3.T1 specifies `'System' | 'serif' | 'monospace'`
 * (the actual Cinzel + Inter font files are not bundled at MVP — they'll be
 * dropped in by the asset pipeline later).
 */
export const fontFamily = {
  system: 'System',
  serif: 'serif',
  monospace: 'monospace',
} as const;

/** Valid font family token keys. */
export type FontFamilyKey = keyof typeof fontFamily;

/**
 * Font size scale (px). Task P1.E3.T1: 12, 14, 16, 18, 24, 32, 48.
 * Body text is 14–18; titles 24–32; hero numbers / display 48.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xl2: 32,
  xl3: 48,
} as const;

/** Valid font size token keys. */
export type FontSizeKey = keyof typeof fontSize;

/**
 * Font weight tokens. RN accepts numeric ('400' / '700') and string
 * ('normal' / 'bold'). Task spec asks for normal / medium / bold.
 */
export const fontWeight = {
  normal: 'normal',
  medium: '500',
  bold: 'bold',
} as const;

/** Valid font weight token keys. */
export type FontWeightKey = keyof typeof fontWeight;

/**
 * Line height multipliers (applied as `lineHeight = fontSize * mult`).
 * Arabic text gets slightly more breathing room (1.5 vs 1.4 for Latin)
 * per spec 10 §4.5.
 */
export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.5,
} as const;

/** Valid line-height token keys. */
export type LineHeightKey = keyof typeof lineHeight;

/**
 * Typography presets (variant + scale combos). Used by the `<Text>`
 * primitive to resolve fontFamily / size / weight / lineHeight from a
 * single `variant` prop.
 *
 * Variant keys mirror the task spec: `'display' | 'title' | 'body' |
 * 'caption' | 'label'`. Each variant has three scales (`'sm' | 'md' | 'lg'`).
 */
export interface TypographyPreset {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
}

/** Typography variant preset table. */
export const typography: Record<
  'display' | 'title' | 'body' | 'caption' | 'label',
  Record<'sm' | 'md' | 'lg', TypographyPreset>
> = {
  display: {
    sm: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.xl * lineHeight.tight,
      letterSpacing: 0.5,
    },
    md: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.xl2,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.xl2 * lineHeight.tight,
      letterSpacing: 0.5,
    },
    lg: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.xl3,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.xl3 * lineHeight.tight,
      letterSpacing: 0.5,
    },
  },
  title: {
    sm: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.lg * lineHeight.normal,
    },
    md: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.xl * lineHeight.normal,
    },
    lg: {
      fontFamily: fontFamily.serif,
      fontSize: fontSize.xl2,
      fontWeight: fontWeight.bold,
      lineHeight: fontSize.xl2 * lineHeight.normal,
    },
  },
  body: {
    sm: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.normal,
      lineHeight: fontSize.xs * lineHeight.normal,
    },
    md: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.normal,
      lineHeight: fontSize.sm * lineHeight.normal,
    },
    lg: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.md,
      fontWeight: fontWeight.normal,
      lineHeight: fontSize.md * lineHeight.normal,
    },
  },
  caption: {
    sm: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.normal,
      lineHeight: fontSize.xs * lineHeight.normal,
    },
    md: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      lineHeight: fontSize.xs * lineHeight.normal,
    },
    lg: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      lineHeight: fontSize.sm * lineHeight.normal,
    },
  },
  label: {
    sm: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      lineHeight: fontSize.xs * lineHeight.normal,
    },
    md: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      lineHeight: fontSize.sm * lineHeight.normal,
    },
    lg: {
      fontFamily: fontFamily.system,
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      lineHeight: fontSize.md * lineHeight.normal,
    },
  },
};

/** Valid typography variant keys. */
export type TextVariant = keyof typeof typography;
/** Valid typography scale keys. */
export type TextScale = keyof typeof typography.display;

// ---------------------------------------------------------------------------
// Sizing (spec 05 §2.4 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Sizing tokens: button heights, icon sizes, corner radii, hairline.
 * Task P1.E3.T1 specifies:
 *   - button heights: small=32, medium=40, large=52
 *   - icon sizes: 16, 24, 32, 48
 *   - corner radii: none, sm=4, md=8, lg=16, xl=24, full=999
 */
export const sizing = {
  // Touch targets
  touchTargetMin: 44,

  // Button heights
  buttonHeightSm: 32,
  buttonHeightMd: 40,
  buttonHeightLg: 52,

  // Icon sizes
  iconSm: 16,
  iconMd: 24,
  iconLg: 32,
  iconXl: 48,

  // Corner radii
  radiusNone: 0,
  radiusSm: 4,
  radiusMd: 8,
  radiusLg: 16,
  radiusXl: 24,
  radiusFull: 999,

  // Borders
  borderWidth: 1,
  borderWidthFocus: 2,
  hairline: 0.5,
} as const;

/** Valid radius token names accepted by primitives' `radius` prop. */
export type RadiusKey = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

/** Resolve a {@link RadiusKey} to a numeric pixel value. */
export function resolveRadius(key: RadiusKey): number {
  switch (key) {
    case 'none':
      return sizing.radiusNone;
    case 'sm':
      return sizing.radiusSm;
    case 'md':
      return sizing.radiusMd;
    case 'lg':
      return sizing.radiusLg;
    case 'xl':
      return sizing.radiusXl;
    case 'full':
      return sizing.radiusFull;
  }
}

/** Valid size token keys. */
export type SizingKey = keyof typeof sizing;

// ---------------------------------------------------------------------------
// Shadows / elevation (spec 05 §2.5 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Shadow / elevation presets. Task P1.E3.T1 lists elevation levels
 * 0, 1, 2, 4, 8. The numeric `elevation` prop is Android-only; iOS uses
 * `shadowOpacity` / `shadowRadius` / `shadowOffset`. Both are applied so the
 * same token works on both platforms.
 */
export interface ShadowPreset {
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly elevation: number;
  readonly shadowColor: string;
}

export const shadows: Record<0 | 1 | 2 | 4 | 8, ShadowPreset> = {
  0: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    shadowColor: '#000000',
  },
  1: {
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    shadowColor: '#000000',
  },
  2: {
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    shadowColor: '#000000',
  },
  4: {
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    shadowColor: '#000000',
  },
  8: {
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    shadowColor: '#000000',
  },
};

/** Valid elevation level keys. */
export type ElevationKey = keyof typeof shadows;

// ---------------------------------------------------------------------------
// Z-index (spec 05 §2.6 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Z-index scale. Higher numbers paint on top of lower ones. Task P1.E3.T1
 * specifies: background=0, content=1, sticky=10, modal=100, toast=1000.
 */
export const zIndex = {
  background: 0,
  content: 1,
  sticky: 10,
  modal: 100,
  toast: 1000,
} as const;

/** Valid z-index token keys. */
export type ZIndexKey = keyof typeof zIndex;

// ---------------------------------------------------------------------------
// Animation durations (spec 05 §2.7 + task P1.E3.T1)
// ---------------------------------------------------------------------------

/**
 * Animation duration tokens (ms). Task P1.E3.T1: fast=150, medium=300,
 * slow=500. When the user enables "Reduce Motion", callers should
 * multiply these by 0 (instant) — handled at the component layer.
 */
export const durations = {
  fast: 150,
  medium: 300,
  slow: 500,
} as const;

/** Valid duration token keys. */
export type DurationKey = keyof typeof durations;

// ---------------------------------------------------------------------------
// Aggregate `tokens` object (the single import most components consume)
// ---------------------------------------------------------------------------

/**
 * The full token set. Components typically access this through
 * `useTheme()` from `@/ui/theme/ThemeProvider`, but the same shape is
 * exported here for non-React callers (e.g., style utilities, tests).
 */
export const tokens = {
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
} as const;

/** The full token set type. Returned by `useTheme()`. */
export type ThemeTokens = typeof tokens;
