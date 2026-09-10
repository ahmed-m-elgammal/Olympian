/**
 * Act 1 overworld tileset (P2.E2.T1) — the Nemean forest biome.
 *
 * Extends the demo-glade tileset (appended AFTER `buildTileset()` so
 * existing tileset-local ids never shift — the baked demo map pins
 * them). Tiles are 16×16, palette-locked, and every random texture is
 * seeded so the bake is byte-deterministic.
 *
 * Static prop tiles: oaks / pines / olives, spring pools, border
 * cliffs, ruined columns, worn marble floor, the spawn rune stone.
 *
 * Animated marker tiles (the P2.E2 "alive world" pass — all 4-frame
 * loops exported as tileset animations so `MarkerSystem` entities can
 * play them through the standard `AnimationTable`):
 *  - `shrine_0..3`   puzzle marker — marble obelisk, gem pulses violet
 *  - `brazier_0..3`  boss marker — iron brazier, flame flickers
 *  - `portal_0..3`   return portal — void swirl, sparks orbit
 *
 * @packageDocumentation
 */

import type { Raster } from './png';
import {
  TILE_SIZE,
  blankTile,
  mulberry32,
  rasterFromGrid,
  scatter,
  setPx,
} from './pixelGrid';

// ---------------------------------------------------------------------------
// Legend (all colors from the locked 32-color palette, spec 12 §2.1)
// ---------------------------------------------------------------------------

/** Char → palette id (resolved to RGBA by `pixelGrid.rasterFromGrid`). */
const LEGEND = {
  // outline
  K: 'outline_black',
  // foliage
  B: 'leaf_mid', // canopy body
  b: 'leaf_dark', // canopy shade
  L: 'leaf_light', // canopy lit leaves
  H: 'leaf_highlight', // canopy rim light
  // trunk / wood
  w: 'wood_dark',
  W: 'wood_mid',
  // olive silvering
  s: 'stone_light',
  // water
  q: 'cloth_dark_blue', // deep water / outline
  Q: 'cloth_blue', // water body
  A: 'cloth_blue_light', // wave crest
  a: 'sky_light', // sparkle
  // rock / cliff
  D: 'stone_dark',
  d: 'stone_light',
  E: 'earth_dark', // strata cracks
  // marble (ruins, floor, obelisk)
  M: 'marble_mid',
  m: 'marble_dark',
  I: 'marble_ivory',
  // gem (shrine frames override these rows)
  v: 'cloth_dark_purple',
  V: 'cloth_purple',
  u: 'cloth_purple_light',
  U: 'magic_light',
  // fire (brazier frames override these rows)
  F: 'fire_light',
  R: 'cloth_red_light',
  r: 'cloth_red',
  G: 'gold',
  g: 'gold_mid',
  Y: 'gold_light',
} as const;

/** Convert a grid in this module's legend to a raster. */
function toRaster(rows: readonly string[]): Raster {
  return rasterFromGrid(rows, LEGEND);
}

// ---------------------------------------------------------------------------
// Trees (solid)
// ---------------------------------------------------------------------------

/** Broad oak — round canopy, rim-lit crown, sturdy trunk. */
const TREE_OAK_ROWS = [
  '................',
  '.....KKKKKK.....',
  '...KKHBBBBHKK...',
  '..KBHHBBBBBBbK..',
  '..KBHBBBBBBBbK..',
  '.KBBHBBBBBBBbbK.',
  '.KBBBBBBBBBbbbbK',
  '.KBBBBBBBBBbbbK.',
  '.KBbBBBBBBBbbbK.',
  '..KBbbBBBBBbbK..',
  '..KKBBBBBBBKK...',
  '....KKwwwwK.....',
  '.....KwWWwK.....',
  '.....KwWWwK.....',
  '....KKwwwwKK....',
  '................',
];

/** Pine — tiered triangular silhouette, light left / shade right. */
const TREE_PINE_ROWS = [
  '.......KK.......',
  '......KLHK......',
  '.....KLHHBK.....',
  '....KLHHBBbK....',
  '...KLHHBBBbbK...',
  '..KLHHBBBBbbBK..',
  '....KHHBBbbK....',
  '...KLHHBBBbbK...',
  '..KLHHBBBBbbbK..',
  '.KLHHBBBBBbbbbK.',
  '..KHHBBBBBbbbK..',
  '...KKBBBBbbKK...',
  '.....KwWWwK.....',
  '.....KwWWwK.....',
  '....KKwwwwKK....',
  '................',
];

/** Olive — gnarled trunk, silver-flecked small canopy. */
const TREE_OLIVE_ROWS = [
  '................',
  '................',
  '....KKKKKKK.....',
  '..KKBdBBBdBKK...',
  '.KBdBBBBBddBBK..',
  '.KBBBddBBBBDdBK.',
  'KBdBBBBddBBBDdBK',
  'KBsBBBBBddBBBdK.',
  '.KBdBBBBBBBDbK..',
  '.KbBBBBBBDbbK...',
  '..KKbbBDbbKK....',
  '...KwwK.KwwK....',
  '...KwWKKKwWK....',
  '..KwwWK.KwwWK...',
  '..KKKKK.KKKKK...',
  '................',
];

// ---------------------------------------------------------------------------
// Spring pools (solid) — self-contained single-tile ponds
// ---------------------------------------------------------------------------

/** One spring pool: grassy bank, dark rim, glinting water. */
function pondTile(seed: number): string[] {
  const rows = [
    '................',
    '................',
    '....dddddddd....',
    '...dbqqqqqqbd...',
    '..dbQQQAQQQQbd..',
    '..bQQQQQQQAQqb..',
    '.dbQAQQQQQQQQbd.',
    '.bQQQQQAQQQQQqb.',
    '.bQAQQQQQQQAQqb.',
    '.bQQQAQQQQQQQqb.',
    '.dbQQQQQAQQQQbd.',
    '..bQQAQQQQQQqb..',
    '..dbQQQQQAQQbd..',
    '...dbqqqqqqbd...',
    '....dddddddd....',
    '................',
  ];
  const dst = [...rows];
  const rand = mulberry32(seed);
  // A couple of sky sparkles per pool.
  scatter(dst, rand, 'a', 3, []);
  return dst;
}

// ---------------------------------------------------------------------------
// Border cliffs (solid) — rock face with a grass fringe on top
// ---------------------------------------------------------------------------

function cliffTile(seed: number): string[] {
  const dst = blankTile();
  const rand = mulberry32(seed);
  // Grass fringe blends the wall into the meadow.
  for (let x = 0; x < TILE_SIZE; x++) {
    const grassDepth = 1 + Math.floor(rand() * 2);
    for (let y = 0; y < grassDepth; y++) setPx(dst, x, y, rand() > 0.3 ? 'B' : 'b');
  }
  // Rock face: dark base with a lit top edge.
  for (let y = 2; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) setPx(dst, x, y, 'D');
  }
  for (let x = 0; x < TILE_SIZE; x++) setPx(dst, x, 2, 'd');
  // Broken light strata bands read as sediment layers.
  for (const sy of [5, 9, 13]) {
    let x = Math.floor(rand() * 3);
    while (x < TILE_SIZE) {
      const run = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < run && x < TILE_SIZE; i++, x++) setPx(dst, x, sy, 'd');
      x += 2 + Math.floor(rand() * 3);
    }
  }
  // Short vertical cracks + bottom shading.
  for (let i = 0; i < 3; i++) {
    const cx = 2 + Math.floor(rand() * 12);
    const cy = 3 + Math.floor(rand() * 7);
    setPx(dst, cx, cy, 'E');
    setPx(dst, cx, cy + 1, 'E');
    setPx(dst, cx, cy + 2, 'E');
  }
  for (let x = 0; x < TILE_SIZE; x++) {
    setPx(dst, x, TILE_SIZE - 1, 'E');
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Ruined columns + marble floor (boss gate / clearings)
// ---------------------------------------------------------------------------

/** Broken marble column (solid) — fluted shaft on a stepped base. */
const RUIN_COLUMN_ROWS = [
  '................',
  '....III..ImI....',
  '....IMMI.ImI....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '....KMMMKMMK....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '....IMMMKMMI....',
  '...KMMMMMMMMK...',
  '...KMMMMMMMMK...',
  '...KKKKKKKKKK...',
  '................',
];

/** Worn marble floor slab (non-solid) — boss arena + clearing pads. */
function stoneFloorTile(variant: 0 | 1): string[] {
  const rows =
    variant === 0
      ? [
          'mmmmmmmmmmmmmmmm',
          'mMMMMMMMMMMMMMMm',
          'mMMMMMMMMMMMMMIm',
          'mMMIMMMMMMMMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mMMMMMMmMMMMMMMm',
          'mMMMMMMmMMIMMMMm',
          'mMIMMMMmMMMMMMMm',
          'mMMMMMMmMMMMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mMMMMMMMMMmMMMMm',
          'mMMIMMMMMMmMMMMm',
          'mMMMMMMMMMmMMIMm',
          'mMMMMMMMMMmMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mmmmmmmmmmmmmmmm',
        ]
      : [
          'mmmmmmmmmmmmmmmm',
          'mMMMMMmMMMMMMMMm',
          'mMMIMMmMMMMMMIMm',
          'mMMMMMmMMMMMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mMMMMMMMMmMMMMMm',
          'mMIMMMMMMmMMIMMm',
          'mMMMMMMMMmMMMMMm',
          'mMMMMMMMMmMMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mMMMMMmMMMMMMMMm',
          'mMMMMMmMMIMMMMIm',
          'mMIMMMmMMMMMMMMm',
          'mMMMMMmMMMMMMMMm',
          'mmmmmmmmmmmmmmmm',
          'mmmmmmmmmmmmmmmm',
        ];
  return [...rows];
}

// ---------------------------------------------------------------------------
// Spawn rune stone (non-solid) — flat slab the hero arrives on
// ---------------------------------------------------------------------------

const SPAWN_STONE_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...MMMMMMMMMM...',
  '..MMIIMMMMIIMM..',
  '.MMMgggMMgggMMM.',
  '.MMIgggMMgggIMM.',
  '.MMMgggMMgggMMM.',
  '.MMIIIIIIIIIIMM.',
  '..MMMMMMMMMMMM..',
  '...mmmmmmmmmm...',
];

// ---------------------------------------------------------------------------
// Puzzle shrine (animated ×4) — obelisk with a pulsing violet gem
// ---------------------------------------------------------------------------

/** Static obelisk body; `@` marks the gem band replaced per frame. */
const SHRINE_BODY = [
  '................',
  '................',
  '......dddd......',
  '.....dImmId.....',
  '.....dImmId.....',
  '....dIImmIId....',
  '....dIIIIIIId...',
  '....dII@@@@Id...',
  '....dII@@@@Id...',
  '....dIIIIIIId...',
  '....dII@@@@Id...',
  '....dII@@@@Id...',
  '....dIIIIIIId...',
  '...dIIIIIIIId...',
  '..dmmmmmmmmmmd..',
  '...dddddddddd...',
];

/** Gem palette per frame (dim → bright → sparkle → bright). */
const SHRINE_GEM_FRAMES: ReadonlyArray<readonly [string, string]> = [
  ['v', 'v'],
  ['v', 'V'],
  ['U', 'u'],
  ['V', 'u'],
];

function shrineFrame(frame: 0 | 1 | 2 | 3): string[] {
  const [edge, core] = SHRINE_GEM_FRAMES[frame];
  const dst = SHRINE_BODY.map((row) => row.replace(/@/g, ' '));
  // Gem band occupies rows 7-8 and 10-11 (see '@' cells above).
  const bands: Array<[number, number]> = [
    [7, 8],
    [10, 11],
  ];
  for (const [y0, y1] of bands) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (SHRINE_BODY[y0][x] === '@') setPx(dst, x, y0, edge);
      if (SHRINE_BODY[y1][x] === '@') setPx(dst, x, y1, core);
    }
  }
  // Sparkle pixel floating above the tip on the bright frame.
  if (frame === 2) {
    setPx(dst, 7, 0, 'U');
    setPx(dst, 9, 1, 'u');
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Boss brazier (animated ×4) — iron/gold bowl with flickering flame
// ---------------------------------------------------------------------------

/** Bowl + base (rows 7+); flame rows 1-6 are redrawn per frame. */
const BRAZIER_BODY = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....KGGGGGGK....',
  '...KGGGggGGGK...',
  '...KGggggggGK...',
  '....KggggggK....',
  '.....KggggK.....',
  '......KgGK......',
  '....KGGgGGGK....',
  '...KKKKKKKKKK...',
  '................',
];

/** Flame grids per frame (rows 1-6; '.' = keep bowl body). */
const BRAZIER_FLAMES: ReadonlyArray<readonly string[]> = [
  [
    '................',
    '................',
    '................',
    '................',
    '......R.........',
    '.....RFR........',
    '.....RFRF.......',
  ],
  [
    '................',
    '................',
    '.......F........',
    '......FRF.......',
    '.....FFRRF......',
    '.....FRRRF......',
    '.....RrRRF......',
  ],
  [
    '................',
    '................',
    '................',
    '.......RF.......',
    '......FRRF......',
    '.....FRrRF......',
    '......RrRF......',
  ],
  [
    '................',
    '......F.........',
    '.....FRF........',
    '....FFRRF.......',
    '....FRRRRF......',
    '.....RrRRF......',
    '.....RrRF.......',
  ],
];

function brazierFrame(frame: 0 | 1 | 2 | 3): string[] {
  const dst = BRAZIER_BODY.map((row) => row);
  const flame = BRAZIER_FLAMES[frame];
  for (let y = 0; y < flame.length; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const ch = flame[y][x];
      if (ch !== '.') setPx(dst, x, y, ch);
    }
  }
  // Embers pop sideways on the two taller frames.
  if (frame === 1 || frame === 3) {
    setPx(dst, 11, 4, 'F');
    setPx(dst, 4, 5, 'r');
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Return portal (animated ×4) — void swirl with orbiting sparks
// ---------------------------------------------------------------------------

/** Static swirl body; `*` cells are the per-frame spark positions. */
const PORTAL_BODY = [
  '................',
  '.....KKKKKK.....',
  '...KKvVVVuvKK...',
  '..KvVuuVVVVuvK..',
  '..KVuVVVvVVuVK..',
  '.KvVVvvVVVVVuvK.',
  '.KV*VVVuvVVV*VK.',
  '.KvVVV*VVVuvVvK.',
  '.KVVVuvVV*VVVvK.',
  '.KvVV*VVuvVVVvK.',
  '..KVuVVVVVVVvK..',
  '..KvVuvVVVvuVK..',
  '...KKvVVVVvKK...',
  '.....KKKKKK.....',
  '................',
  '................',
];

/** Spark orbits (clockwise; each frame lights 2 cells). */
const PORTAL_SPARKS: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> = [
  [
    { x: 3, y: 6 },
    { x: 12, y: 9 },
  ],
  [
    { x: 6, y: 7 },
    { x: 8, y: 8 },
  ],
  [
    { x: 7, y: 5 },
    { x: 5, y: 9 },
  ],
  [
    { x: 9, y: 6 },
    { x: 11, y: 7 },
  ],
];

function portalFrame(frame: 0 | 1 | 2 | 3): string[] {
  const dst = PORTAL_BODY.map((row) => row.replace(/\*/g, 'V'));
  for (const p of PORTAL_SPARKS[frame]) {
    setPx(dst, p.x, p.y, 'U');
  }
  // A gold spark crosses the rim once per loop.
  if (frame === 2) setPx(dst, 12, 2, 'Y');
  if (frame === 0) setPx(dst, 3, 11, 'Y');
  return dst;
}

// ---------------------------------------------------------------------------
// Tileset definition
// ---------------------------------------------------------------------------

/** One entry of the overworld tileset extension. */
export interface OverworldTileDef {
  readonly name: string;
  readonly solid: boolean;
  readonly raster: Raster;
}

/**
 * Overworld tileset extension. Order matters: these append AFTER the
 * demo tiles, so tileset-local id = demoCount + index in this array.
 */
export function buildOverworldTiles(): OverworldTileDef[] {
  return [
    { name: 'tree_oak', solid: true, raster: toRaster(TREE_OAK_ROWS) },
    { name: 'tree_pine', solid: true, raster: toRaster(TREE_PINE_ROWS) },
    { name: 'tree_olive', solid: true, raster: toRaster(TREE_OLIVE_ROWS) },
    { name: 'pond_0', solid: true, raster: toRaster(pondTile(0x5101)) },
    { name: 'pond_1', solid: true, raster: toRaster(pondTile(0x5102)) },
    { name: 'cliff_0', solid: true, raster: toRaster(cliffTile(0x5201)) },
    { name: 'cliff_1', solid: true, raster: toRaster(cliffTile(0x5202)) },
    { name: 'ruin_column', solid: true, raster: toRaster(RUIN_COLUMN_ROWS) },
    { name: 'stone_floor_0', solid: false, raster: toRaster(stoneFloorTile(0)) },
    { name: 'stone_floor_1', solid: false, raster: toRaster(stoneFloorTile(1)) },
    { name: 'spawn_stone', solid: false, raster: toRaster(SPAWN_STONE_ROWS) },
    { name: 'shrine_0', solid: false, raster: toRaster(shrineFrame(0)) },
    { name: 'shrine_1', solid: false, raster: toRaster(shrineFrame(1)) },
    { name: 'shrine_2', solid: false, raster: toRaster(shrineFrame(2)) },
    { name: 'shrine_3', solid: false, raster: toRaster(shrineFrame(3)) },
    { name: 'brazier_0', solid: false, raster: toRaster(brazierFrame(0)) },
    { name: 'brazier_1', solid: false, raster: toRaster(brazierFrame(1)) },
    { name: 'brazier_2', solid: false, raster: toRaster(brazierFrame(2)) },
    { name: 'brazier_3', solid: false, raster: toRaster(brazierFrame(3)) },
    { name: 'portal_0', solid: false, raster: toRaster(portalFrame(0)) },
    { name: 'portal_1', solid: false, raster: toRaster(portalFrame(1)) },
    { name: 'portal_2', solid: false, raster: toRaster(portalFrame(2)) },
    { name: 'portal_3', solid: false, raster: toRaster(portalFrame(3)) },
  ];
}

/**
 * Tileset animations for the animated marker tiles (consumed by the
 * runtime `AnimationTable` through the baked tiles manifest). Flame /
 * gem / swirl loops ping-pong via a repeated frame so they never pop.
 */
export function buildOverworldTileAnimations(): Record<
  string,
  { frames: string[]; fps: number; loop: boolean }
> {
  const cycle = (base: string, order: readonly number[]): string[] =>
    order.map((n) => `${base}_${n}`);
  return {
    marker_shrine: { frames: cycle('shrine', [0, 1, 2, 3]), fps: 4, loop: true },
    marker_brazier: { frames: cycle('brazier', [0, 1, 2, 1]), fps: 6, loop: true },
    marker_portal: { frames: cycle('portal', [0, 1, 2, 3]), fps: 5, loop: true },
  };
}
