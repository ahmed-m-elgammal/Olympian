/**
 * scripts/generate-sprites.ts
 *
 * Generates every game art asset (spec 12 asset pipeline):
 *
 *   assets/sprites/atlas_hero.png/.json        — hero (idle/walk/attack/hit/death)
 *   assets/sprites/atlas_tiles.png/.json       — tileset (demo glade + Act 1 overworld)
 *   assets/tilemaps/demo_glade.json            — P2.E1 acceptance map
 *   assets/tilemaps/act1_overworld.json        — P2.E2.T1 Act 1 overworld (256×192)
 *   assets/tilemaps/act1_area1_room1.json      — P2.E2.T7 puzzle-room shell
 *   scripts/preview/*.png                      — QA previews (gitignored)
 *
 * Everything is generated deterministically from palette-locked pixel
 * definitions in `scripts/sprites/` + map builders in
 * `scripts/tilemaps/`, validated at bake time, and safe to re-run
 * (byte-identical output).
 *
 * Run via: `npm run assets:bake` (see scripts/bake-assets.ts).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { packAtlas } from './sprites/atlas';
import { buildHeroArt, HERO_FRAME_HEIGHT, HERO_FRAME_WIDTH } from './sprites/heroArt';
import { encodePng, type Raster } from './sprites/png';
import { buildDemoMap, buildTileset, DEMO_MAP_HEIGHT, DEMO_MAP_WIDTH, TILE_SIZE } from './sprites/tileArt';
import { buildOverworldTileAnimations, buildOverworldTiles } from './sprites/overworldTiles';
import { buildAct1Overworld } from './tilemaps/act1Overworld';
import { buildAct1Room } from './tilemaps/act1Room';
import { PALETTE } from './sprites/palette';

const ROOT = join(__dirname, '..');
const SPRITES_DIR = join(ROOT, 'assets', 'sprites');
const TILEMAPS_DIR = join(ROOT, 'assets', 'tilemaps');
/** QA previews (gitignored) live beside the other scripts, inside the repo. */
const PREVIEW_DIR = join(__dirname, 'preview');

/** Scale a raster by an integer factor (nearest neighbour). */
function upscale(raster: Raster, factor: number): Raster {
  const { width, height, data } = raster;
  const out = new Uint8Array(width * factor * height * factor * 4);
  for (let y = 0; y < height * factor; y++) {
    for (let x = 0; x < width * factor; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const src = (sy * width + sx) * 4;
      const dst = (y * width * factor + x) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return { width: width * factor, height: height * factor, data: out };
}

/** Compose frames side by side (single row) for a QA preview image. */
function strip(frames: ReadonlyArray<Raster>, gap: number): Raster {
  const w = frames.reduce((acc, f) => acc + f.width + gap, -gap);
  const h = Math.max(...frames.map((f) => f.height));
  const data = new Uint8Array(w * h * 4);
  // Dark background so silhouettes are visible.
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 0x0e;
    data[i * 4 + 1] = 0x0a;
    data[i * 4 + 2] = 0x1f;
    data[i * 4 + 3] = 255;
  }
  let ox = 0;
  for (const f of frames) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const src = (y * f.width + x) * 4;
        if (f.data[src + 3] === 0) continue;
        const dst = (y * w + ox + x) * 4;
        data[dst] = f.data[src];
        data[dst + 1] = f.data[src + 1];
        data[dst + 2] = f.data[src + 2];
        data[dst + 3] = 255;
      }
    }
    ox += f.width + gap;
  }
  return { width: w, height: h, data };
}

/**
 * Render a baked Tiled map to a QA preview raster (1px = 1px, ground
 * under obstacles; object layers skipped). Deterministic and read-only
 * — a failed render never affects the baked JSON.
 */
function mapPreview(mapJson: unknown, tiles: ReadonlyArray<{ name: string; raster: Raster }>, firstgid: number): Raster {
  const map = mapJson as {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    layers: Array<{ type: string; data?: number[] }>;
  };
  const w = map.width * map.tilewidth;
  const h = map.height * map.tileheight;
  const data = new Uint8Array(w * h * 4);
  // Void background so unpainted cells are visible in QA.
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 0x0e;
    data[i * 4 + 1] = 0x0a;
    data[i * 4 + 2] = 0x1f;
    data[i * 4 + 3] = 255;
  }
  const byGid = new Map<number, Raster>();
  tiles.forEach((t, i) => byGid.set(firstgid + i, t.raster));

  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || !layer.data) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const raster = byGid.get(layer.data[i]);
      if (!raster) continue;
      const tx = (i % map.width) * map.tilewidth;
      const ty = Math.floor(i / map.width) * map.tileheight;
      for (let y = 0; y < raster.height; y++) {
        for (let x = 0; x < raster.width; x++) {
          const src = (y * raster.width + x) * 4;
          if (raster.data[src + 3] === 0) continue;
          const dst = ((ty + y) * w + tx + x) * 4;
          data[dst] = raster.data[src];
          data[dst + 1] = raster.data[src + 1];
          data[dst + 2] = raster.data[src + 2];
          data[dst + 3] = 255;
        }
      }
    }
  }
  return { width: w, height: h, data };
}

/** All palette RGBAs as a set of packed ints (palette-lock validation). */
function paletteIntSet(): Set<number> {
  const set = new Set<number>();
  for (const entry of Object.values(PALETTE)) {
    const hex = entry.hex.replace('#', '');
    set.add(parseInt(hex, 16));
  }
  set.add(0); // transparent
  return set;
}

/**
 * Reject any off-palette pixel. By construction the legend only maps
 * palette ids, but this guards future edits to the raster pipeline.
 */
function validatePaletteLock(raster: Raster, label: string): void {
  const allowed = paletteIntSet();
  const { data } = raster;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const packed = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (!allowed.has(packed)) {
      throw new Error(
        `${label}: off-palette pixel #${packed.toString(16).padStart(6, '0')} at ${i / 4}`,
      );
    }
  }
}

/**
 * Generate every game art asset. Exported so `bake-assets.ts` (the
 * `npm run assets:bake` entry) can invoke the pipeline programmatically.
 */
export function generateSprites(): void {
  mkdirSync(SPRITES_DIR, { recursive: true });
  mkdirSync(TILEMAPS_DIR, { recursive: true });
  mkdirSync(PREVIEW_DIR, { recursive: true });

  // ---- Hero atlas -------------------------------------------------------
  const hero = buildHeroArt();
  if (hero.frames.length !== 49) {
    throw new Error(
      `generate-sprites: expected 49 hero frames (16 idle + 24 walk + 3 attack + 2 hit + 4 death), got ${hero.frames.length}`,
    );
  }
  const heroPacked = packAtlas(
    hero.frames.map((f) => ({ name: f.name, width: HERO_FRAME_WIDTH, height: HERO_FRAME_HEIGHT, raster: f.raster })),
  );
  for (const f of hero.frames) validatePaletteLock(f.raster, `hero:${f.name}`);
  writeFileSync(join(SPRITES_DIR, 'atlas_hero.png'), encodePng(heroPacked.raster));
  writeFileSync(
    join(SPRITES_DIR, 'atlas_hero.json'),
    JSON.stringify(
      {
        atlas: 'atlas_hero',
        frameWidth: HERO_FRAME_WIDTH,
        frameHeight: HERO_FRAME_HEIGHT,
        width: heroPacked.atlasSize,
        height: heroPacked.atlasSize,
        frames: heroPacked.frames,
        animations: hero.animations,
      },
      null,
      2,
    ),
  );

  const heroStrip = strip(
    hero.frames.map((f) => f.raster),
    2,
  );
  writeFileSync(join(PREVIEW_DIR, 'hero_preview.png'), encodePng(upscale(heroStrip, 4)));

  // ---- Tile atlas (demo glade + Act 1 overworld extension) ---------------
  const tileset = [...buildTileset(), ...buildOverworldTiles()];
  const tileAnimations = buildOverworldTileAnimations();
  const tilePacked = packAtlas(
    tileset.map((t) => ({ name: t.name, width: TILE_SIZE, height: TILE_SIZE, raster: t.raster })),
  );
  for (const t of tileset) validatePaletteLock(t.raster, `tile:${t.name}`);
  writeFileSync(join(SPRITES_DIR, 'atlas_tiles.png'), encodePng(tilePacked.raster));
  writeFileSync(
    join(SPRITES_DIR, 'atlas_tiles.json'),
    JSON.stringify(
      {
        atlas: 'atlas_tiles',
        frameWidth: TILE_SIZE,
        frameHeight: TILE_SIZE,
        width: tilePacked.atlasSize,
        height: tilePacked.atlasSize,
        frames: tilePacked.frames,
        tiles: tileset.map((t) => ({ name: t.name, solid: t.solid })),
        animations: tileAnimations,
      },
      null,
      2,
    ),
  );

  const tileStrip = strip(
    tileset.map((t) => t.raster),
    2,
  );
  writeFileSync(join(PREVIEW_DIR, 'tiles_preview.png'), encodePng(upscale(tileStrip, 8)));

  // ---- Tilemaps -----------------------------------------------------------
  const firstgid = 1;
  const atlasSize = tilePacked.atlasSize;

  const demoMap = buildDemoMap(firstgid, atlasSize, atlasSize);
  writeFileSync(join(TILEMAPS_DIR, 'demo_glade.json'), JSON.stringify(demoMap, null, 2));

  const act1Map = buildAct1Overworld(firstgid, atlasSize, atlasSize);
  writeFileSync(join(TILEMAPS_DIR, 'act1_overworld.json'), JSON.stringify(act1Map, null, 2));

  const act1Room = buildAct1Room(firstgid, atlasSize, atlasSize);
  writeFileSync(join(TILEMAPS_DIR, 'act1_area1_room1.json'), JSON.stringify(act1Room, null, 2));

  // ---- Map previews (QA only, gitignored) ----------------------------------
  writeFileSync(
    join(PREVIEW_DIR, 'map_demo_glade.png'),
    encodePng(mapPreview(demoMap, tileset, firstgid)),
  );
  writeFileSync(
    join(PREVIEW_DIR, 'map_act1_overworld.png'),
    encodePng(mapPreview(act1Map, tileset, firstgid)),
  );
  writeFileSync(
    join(PREVIEW_DIR, 'map_act1_room.png'),
    encodePng(upscale(mapPreview(act1Room, tileset, firstgid), 2)),
  );

  console.log(
    `[generate-sprites] hero: ${hero.frames.length} frames → atlas_hero (${heroPacked.atlasSize}²)`,
  );
  console.log(
    `[generate-sprites] tiles: ${tileset.length} tiles → atlas_tiles (${tilePacked.atlasSize}²)`,
  );
  console.log(
    `[generate-sprites] maps: demo_glade ${DEMO_MAP_WIDTH}×${DEMO_MAP_HEIGHT}, act1_overworld 256×192, act1_area1_room1 30×20`,
  );
  console.log('[generate-sprites] OK');
}

if (require.main === module) {
  generateSprites();
}
