/**
 * Demo-glade tileset + map (supports the P2.E1 acceptance demo).
 *
 * The Nemean glade is the Act 1 forest biome (spec 01: biomePrologue /
 * forest). Tiles are 16×16, palette-locked, generated with a seeded
 * PRNG so the bake is fully deterministic (same output every run).
 *
 * The demo map is a small Tiled-format JSON: a stone-walled glade with
 * scattered boulders / bushes (solid) and a dirt path. It exists so
 * P2.E1's acceptance criteria are demonstrable end-to-end (hero walks a
 * real map with collision); the authored Act 1 overworld replaces it in
 * P2.E2 (P2.E2.T1).
 */

import { buildLegend } from './palette';
import { rasterFromRows, type Raster } from './png';

export const TILE_SIZE = 16;

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const LEGEND = buildLegend({
  d: 'leaf_dark', // grass shadow
  g: 'leaf_mid', // grass base
  l: 'leaf_light', // grass light blades
  h: 'leaf_highlight', // tuft highlights
  e: 'earth_light', // dirt light
  m: 'gold_mid', // dirt base (gold_mid doubles as tawny earth)
  D: 'earth_dark', // dirt shadow
  s: 'stone_light', // rock light
  S: 'stone_dark', // rock shadow
  M: 'marble_dark', // wall mortar
  W: 'marble_mid', // wall block
  I: 'marble_ivory', // wall highlight
  p: 'cloth_purple', // flower (purple)
  y: 'gold', // flower (gold)
  b: 'leaf_dark', // bush core
  B: 'leaf_mid', // bush body
  c: 'cloth_red_light', // berries
});

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — stable bakes across runs/CI
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tile painting helpers
// ---------------------------------------------------------------------------

/** Blank transparent tile. */
const blankTile = (): string[] =>
  Array.from({ length: TILE_SIZE }, () => '.'.repeat(TILE_SIZE));

function setPx(dst: string[], x: number, y: number, ch: string): void {
  if (y < 0 || y >= TILE_SIZE || x < 0 || x >= TILE_SIZE) return;
  const row = dst[y].split('');
  row[x] = ch;
  dst[y] = row.join('');
}

function fill(dst: string[], ch: string): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    dst[y] = ch.repeat(TILE_SIZE);
  }
}

function scatter(
  dst: string[],
  rand: () => number,
  ch: string,
  count: number,
  avoid: ReadonlyArray<{ x: number; y: number }> = [],
): void {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    if (avoid.some((p) => p.x === x && p.y === y)) continue;
    setPx(dst, x, y, ch);
    placed++;
  }
}

// ---------------------------------------------------------------------------
// Tile painters
// ---------------------------------------------------------------------------

/** Base grass: mid green with dark/light single-pixel noise. */
function grassTile(seed: number): string[] {
  const dst = blankTile();
  const rand = mulberry32(seed);
  fill(dst, 'g');
  scatter(dst, rand, 'd', 34);
  scatter(dst, rand, 'l', 18);
  return dst;
}

/** Grass with 3 highlighted blade tufts. */
function grassTuftTile(seed: number): string[] {
  const dst = grassTile(seed);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  for (let i = 0; i < 3; i++) {
    const x = 2 + Math.floor(rand() * 12);
    const y = 3 + Math.floor(rand() * 10);
    setPx(dst, x, y, 'h');
    setPx(dst, x, y - 1, 'l');
    setPx(dst, x, y - 2, 'l');
  }
  return dst;
}

/** Grass with purple + gold flowers (divine meadow motif). */
function grassFlowerTile(seed: number): string[] {
  const dst = grassTile(seed);
  const rand = mulberry32(seed ^ 0x51ed270b);
  const spots: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(rand() * 12);
    const y = 2 + Math.floor(rand() * 12);
    if (spots.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3)) continue;
    spots.push({ x, y });
    setPx(dst, x, y, i % 2 === 0 ? 'p' : 'y');
    setPx(dst, x - 1, y, 'D');
  }
  return dst;
}

/** Dirt path with horizontal tread streaks. */
function pathTile(seed: number, variant: 0 | 1): string[] {
  const dst = blankTile();
  const rand = mulberry32(seed);
  fill(dst, 'm');
  scatter(dst, rand, 'D', 26);
  scatter(dst, rand, 'e', 20);
  // Horizontal tread lines every ~4 rows.
  for (let y = variant === 0 ? 3 : 7; y < TILE_SIZE; y += 5) {
    const x0 = Math.floor(rand() * 4);
    for (let x = x0; x < x0 + 9 + Math.floor(rand() * 5); x++) {
      setPx(dst, x, y, rand() > 0.5 ? 'D' : 'e');
    }
  }
  return dst;
}

/** Stone wall block (glade border) — marble masonry with mortar. */
function wallTile(): string[] {
  const dst = blankTile();
  const rand = mulberry32(0xca11ab1e);
  fill(dst, 'M');
  // Two courses of blocks per tile, offset like masonry.
  const courses = [
    { y0: 1, x0: 1, w: 6 },
    { y0: 1, x0: 9, w: 6 },
    { y0: 9, x0: -3, w: 6 },
    { y0: 9, x0: 5, w: 6 },
  ];
  for (const c of courses) {
    for (let y = c.y0; y < c.y0 + 6; y++) {
      for (let x = c.x0; x < c.x0 + c.w; x++) {
        if (x < 0 || x >= TILE_SIZE || y >= TILE_SIZE) continue;
        setPx(dst, x, y, 'W');
      }
    }
    // Ivory highlight on the top edge, dark shade on the bottom edge.
    for (let x = c.x0; x < c.x0 + c.w; x++) {
      setPx(dst, x, c.y0, 'I');
      setPx(dst, x, c.y0 + 5, 'M');
    }
  }
  scatter(dst, rand, 'M', 6);
  return dst;
}

/** Boulder (solid prop) — hand-shaped with light/shadow planes. */
const ROCK_ROWS = [
  '................',
  '................',
  '................',
  '....KKKKKK......',
  '...KsssssKK.....',
  '..KsWWsssssK....',
  '..KsWsssssssK...',
  '.KsWssssssSsK...',
  '.KsssssssSSSK...',
  '.KssssssSSSSK...',
  '.KsssssSSSSSK...',
  '..KssssSSSSK....',
  '..KSssssSSSK....',
  '...KKSSSSKK.....',
  '.....KKKK.......',
  '................',
];

/** Bush (solid prop) — leafy blob with red berries. */
const BUSH_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '.....KKKKK......',
  '...KKBBBBBKK....',
  '..KBBbBBBBBBK...',
  '.KBBbBBcBBBBBK..',
  '.KBbBBBBBBBbBK..',
  '.KBBBcBBBBBBBK..',
  '..KBBBBcBBbBK...',
  '..KKBBBBBBBKK...',
  '....KKKbKKKK....',
  '................',
  '................',
  '................',
];

function rasterFromGrid(rows: readonly string[], _seed = 0): Raster {
  if (rows.length !== TILE_SIZE) {
    throw new Error(`tileArt: expected ${TILE_SIZE} rows, got ${rows.length}`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== TILE_SIZE) {
      throw new Error(`tileArt: row ${i} is ${rows[i].length} chars: "${rows[i]}"`);
    }
  }
  return rasterFromRows(rows, LEGEND, TILE_SIZE, TILE_SIZE);
}

// ---------------------------------------------------------------------------
// Tileset definition
// ---------------------------------------------------------------------------

export interface TileDef {
  readonly name: string;
  readonly solid: boolean;
  readonly raster: Raster;
}

/**
 * Tileset order matters: index in this array = tileset-local id
 * (global id = firstgid + index in the demo map).
 */
export function buildTileset(): TileDef[] {
  return [
    { name: 'grass_0', solid: false, raster: rasterFromGrid(grassTile(0x1001), 0) },
    { name: 'grass_1', solid: false, raster: rasterFromGrid(grassTile(0x1002), 0) },
    { name: 'grass_2', solid: false, raster: rasterFromGrid(grassTile(0x1003), 0) },
    { name: 'grass_3', solid: false, raster: rasterFromGrid(grassTile(0x1004), 0) },
    { name: 'grass_tuft', solid: false, raster: rasterFromGrid(grassTuftTile(0x2001), 0) },
    { name: 'grass_flowers', solid: false, raster: rasterFromGrid(grassFlowerTile(0x3001), 0) },
    { name: 'path_0', solid: false, raster: rasterFromGrid(pathTile(0x4001, 0), 0) },
    { name: 'path_1', solid: false, raster: rasterFromGrid(pathTile(0x4002, 1), 0) },
    { name: 'stone_wall', solid: true, raster: rasterFromGrid(wallTile(), 0) },
    { name: 'rock', solid: true, raster: rasterFromGrid(ROCK_ROWS, 0) },
    { name: 'bush', solid: true, raster: rasterFromGrid(BUSH_ROWS, 0) },
  ];
}

// ---------------------------------------------------------------------------
// Demo map (Tiled JSON, 2 layers: ground + obstacles)
// ---------------------------------------------------------------------------

export const DEMO_MAP_WIDTH = 30;
export const DEMO_MAP_HEIGHT = 28;
/** Ground band (rows) the dirt path runs through. */
const PATH_ROWS = [13, 14, 15];
/** Where the hero spawns (tile coords). */
export const DEMO_SPAWN = { tx: 14, ty: 20 };

/**
 * Generate the demo glade map as a Tiled-JSON-shaped object.
 * Deterministic; validated by the bake pipeline.
 */
export function buildDemoMap(
  firstgid: number,
  atlasWidth: number,
  atlasHeight: number,
): unknown {
  const tiles = buildTileset();
  const gidOf = Object.fromEntries(
    tiles.map((t, i) => [t.name, firstgid + i] as const),
  );
  const grassIds = [gidOf.grass_0, gidOf.grass_1, gidOf.grass_2, gidOf.grass_3];
  const rand = mulberry32(0x0a11ce);

  const ground: number[] = [];
  const obstacles: number[] = [];
  for (let y = 0; y < DEMO_MAP_HEIGHT; y++) {
    for (let x = 0; x < DEMO_MAP_WIDTH; x++) {
      const isBorder = x === 0 || y === 0 || x === DEMO_MAP_WIDTH - 1 || y === DEMO_MAP_HEIGHT - 1;
      // Dirt path band with ragged edges.
      const inPath = PATH_ROWS.includes(y) && x >= 1 && x <= DEMO_MAP_WIDTH - 2;
      const pathEdge = Math.abs(y - 14) === 2 && rand() > 0.6 && x >= 1 && x <= DEMO_MAP_WIDTH - 2;

      let groundGid: number;
      if (inPath) {
        groundGid = rand() > 0.25 ? gidOf.path_0 : gidOf.path_1;
      } else if (pathEdge) {
        groundGid = gidOf.path_1;
      } else {
        const r = rand();
        groundGid =
          r < 0.62
            ? grassIds[Math.floor(rand() * grassIds.length)]
            : r < 0.82
              ? gidOf.grass_tuft
              : gidOf.grass_flowers;
      }
      ground.push(groundGid);
      obstacles.push(isBorder ? gidOf.stone_wall : 0);
    }
  }

  // Scatter solid props (rocks / bushes) away from the path and spawn.
  const solidProps: Array<{ x: number; y: number }> = [];
  const spawn = DEMO_SPAWN;
  const tooClose = (x: number, y: number): boolean =>
    PATH_ROWS.some((py) => Math.abs(y - py) <= 2) ||
    Math.abs(x - spawn.tx) < 3 ||
    Math.abs(y - spawn.ty) < 3 ||
    solidProps.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3);

  let placed = 0;
  let guard = 0;
  while (placed < 9 && guard < 500) {
    guard++;
    const x = 2 + Math.floor(rand() * (DEMO_MAP_WIDTH - 4));
    const y = 2 + Math.floor(rand() * (DEMO_MAP_HEIGHT - 4));
    if (tooClose(x, y)) continue;
    obstacles[y * DEMO_MAP_WIDTH + x] = rand() > 0.5 ? gidOf.rock : gidOf.bush;
    solidProps.push({ x, y });
    placed++;
  }

  return {
    name: 'demo_glade',
    width: DEMO_MAP_WIDTH,
    height: DEMO_MAP_HEIGHT,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    layers: [
      {
        name: 'ground',
        type: 'tilelayer',
        visible: true,
        width: DEMO_MAP_WIDTH,
        height: DEMO_MAP_HEIGHT,
        data: ground,
      },
      {
        name: 'obstacles',
        type: 'tilelayer',
        visible: true,
        width: DEMO_MAP_WIDTH,
        height: DEMO_MAP_HEIGHT,
        data: obstacles,
      },
    ],
    tilesets: [
      {
        firstgid,
        name: 'atlas_tiles',
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        image: 'atlas_tiles.png',
        imagewidth: atlasWidth,
        imageheight: atlasHeight,
      },
    ],
  };
}
