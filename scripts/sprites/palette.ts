/**
 * The locked 32-color shared palette (spec 12 §2.1).
 *
 * Every pixel in every generated sprite MUST come from this table. The
 * generator validates this at bake time and rejects off-palette pixels.
 *
 * The palette is grouped into families of 4 shades each (void / marble /
 * wood / leaf / red / purple / blue / gold) plus the earth/stone/outline
 * neutrals the spec's summary table folds in. Pixel-art legends (see
 * `heroArt.ts` / `tileArt.ts`) map single characters to entries here so
 * the ASCII source grids stay readable.
 */

/** One palette entry. */
export interface PaletteColor {
  /** Human-readable name (spec 12 §2.1). */
  readonly name: string;
  /** Hex RGB, e.g. `#e8b34a`. */
  readonly hex: string;
}

/** The locked palette, keyed by stable snake_case ids. */
export const PALETTE: Readonly<Record<string, PaletteColor>> = Object.freeze({
  // ---- void (backgrounds, deep shadow) ----
  void_black: { name: 'void_black', hex: '#0e0a1f' },
  void_deep: { name: 'void_deep', hex: '#1a1230' },
  void_mid: { name: 'void_mid', hex: '#2a1f4a' },
  void_light: { name: 'void_light', hex: '#3a2d5e' },

  // ---- marble (statues, ivory text, skin highlights) ----
  marble_dark: { name: 'marble_dark', hex: '#5a4a7e' },
  marble_mid: { name: 'marble_mid', hex: '#7a6a9e' },
  marble_light: { name: 'marble_light', hex: '#a89cc8' },
  marble_ivory: { name: 'marble_ivory', hex: '#f4ecd8' },

  // ---- wood (crates, spear shafts, sandals) ----
  wood_dark: { name: 'wood_dark', hex: '#2a1810' },
  wood_mid: { name: 'wood_mid', hex: '#5a3018' },
  wood_light: { name: 'wood_light', hex: '#8a5028' },
  wood_highlight: { name: 'wood_highlight', hex: '#c08050' },

  // ---- leaf (foliage, grass, nature) ----
  leaf_dark: { name: 'leaf_dark', hex: '#1a2a1a' },
  leaf_mid: { name: 'leaf_mid', hex: '#3a5a3a' },
  leaf_light: { name: 'leaf_light', hex: '#6a9a4a' },
  leaf_highlight: { name: 'leaf_highlight', hex: '#a8d870' },

  // ---- red (cloth, fire, HP, danger) ----
  cloth_dark_red: { name: 'cloth_dark_red', hex: '#4a1a1a' },
  cloth_red: { name: 'cloth_red', hex: '#8a3030' },
  cloth_red_light: { name: 'cloth_red_light', hex: '#d04848' },
  fire_light: { name: 'fire_light', hex: '#f4a060' },

  // ---- purple (divine, magic, Athena) ----
  cloth_dark_purple: { name: 'cloth_dark_purple', hex: '#4a1a3a' },
  cloth_purple: { name: 'cloth_purple', hex: '#8b4a8c' },
  cloth_purple_light: { name: 'cloth_purple_light', hex: '#c068c8' },
  magic_light: { name: 'magic_light', hex: '#e8a0e8' },

  // ---- blue (water, sky, MP, info) ----
  cloth_dark_blue: { name: 'cloth_dark_blue', hex: '#1a2a4a' },
  cloth_blue: { name: 'cloth_blue', hex: '#3a5aa8' },
  cloth_blue_light: { name: 'cloth_blue_light', hex: '#4a8cd0' },
  sky_light: { name: 'sky_light', hex: '#a0c8f0' },

  // ---- gold (primary, gold, sun, HERO) ----
  gold_dark: { name: 'gold_dark', hex: '#5a3a1a' },
  gold_mid: { name: 'gold_mid', hex: '#8a5a30' },
  gold: { name: 'gold', hex: '#e8b34a' },
  gold_light: { name: 'gold_light', hex: '#f4d068' },

  // ---- neutrals (earth / stone / outline from the spec table) ----
  earth_dark: { name: 'earth_dark', hex: '#3a2a1a' },
  earth_light: { name: 'earth_light', hex: '#c8a060' },
  stone_dark: { name: 'stone_dark', hex: '#2a2a2a' },
  stone_light: { name: 'stone_light', hex: '#a8a8a8' },
  outline_black: { name: 'outline_black', hex: '#000000' },
});

/**
 * Hex string → RGBA byte tuple. `#rrggbb` → [r, g, b, 255].
 */
export function hexToRgba(hex: string): [number, number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) {
    throw new Error(`palette: invalid hex "${hex}"`);
  }
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff, 255];
}

/** RGBA tuple convenience alias. */
export type Rgba = [number, number, number, number];

/**
 * Build the char → RGBA lookup used by ASCII pixel grids. Any character
 * not present in the legend resolves to fully transparent.
 */
export function buildLegend(
  legend: Readonly<Record<string, string>>,
): (ch: string) => Rgba {
  const resolved = new Map<string, Rgba>();
  for (const [ch, paletteId] of Object.entries(legend)) {
    const entry = PALETTE[paletteId];
    if (!entry) {
      throw new Error(
        `palette: legend char "${ch}" references unknown palette id "${paletteId}"`,
      );
    }
    resolved.set(ch, hexToRgba(entry.hex));
  }
  const transparent: Rgba = [0, 0, 0, 0];
  return (ch: string) => resolved.get(ch) ?? transparent;
}
