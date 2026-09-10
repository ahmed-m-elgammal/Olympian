/**
 * scripts/bake-assets.ts — `npm run assets:bake` entry (spec 12 §6).
 *
 * Invokes the deterministic sprite/tilemap generator
 * (`generate-sprites.ts`), which writes:
 *
 *   assets/sprites/atlas_hero.png/.json   — hero sheet (49 frames)
 *   assets/sprites/atlas_tiles.png/.json  — demo-glade tileset
 *   assets/tilemaps/demo_glade.json       — Tiled-format demo map
 *
 * The generator validates palette-lock on every frame and fails loudly
 * on any off-palette pixel, so a green bake == shipped art is exactly
 * what the pixel definitions describe.
 */

import { generateSprites } from './generate-sprites';

export function bakeAssets(): void {
  console.log('[bake-assets] Generating sprite atlases + demo map...');
  generateSprites();
  console.log('[bake-assets] Done.');
}

if (require.main === module) {
  bakeAssets();
}
