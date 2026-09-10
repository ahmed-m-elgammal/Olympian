/**
 * Act 1 overworld map generator (P2.E2.T1/T2) — 256×192 tiles, Tiled JSON.
 *
 * The Nemean glade at world scale (spec 01 §3.1: one scrolling map per
 * Act, N puzzle markers + 1 boss marker). The geography is hand-composed
 * (clearings, lanes, boss arena) and textured deterministically:
 *
 *   ┌────────── cliff ring (solid) ──────────┐
 *   │            [ BOSS ARENA ]              │  stone floor + ruin gate,
 *   │                 │ gate                 │  brazier boss marker
 *   │   NW shrine          NE shrine         │
 *   │        W ─── central ─── E meadow       │  8 stone clearing pads,
 *   │   SW shrine          SE shrine         │  shrine puzzle markers
 *   │        SW-fork ── SE-fork               │
 *   │            [ spawn stone + portal ]     │  road back to camp
 *   └────────────────────────────────────────┘
 *
 * Layers: `ground` (grass / path / marble pads), `obstacles` (cliffs,
 * trees, pools, rocks, bushes — solid per the tileset manifest), and an
 * `objects` objectgroup carrying the P2.E2.T2 markers + spawn.
 *
 * Everything is seeded — the bake is byte-identical across runs, and
 * `__tests__/game/act1Maps.test.ts` flood-fills the result to prove
 * every marker is walkable from the spawn.
 *
 * @packageDocumentation
 */

import { mulberry32 } from '../sprites/pixelGrid';
import { buildTileset } from '../sprites/tileArt';
import { buildOverworldTiles } from '../sprites/overworldTiles';
import { tiledMapJson, type TiledMapObject } from './mapJson';

// ---------------------------------------------------------------------------
// World constants (spec 01 §3.1: 256×192 tiles per Act)
// ---------------------------------------------------------------------------

export const ACT1_MAP_WIDTH = 256;
export const ACT1_MAP_HEIGHT = 192;

/** Where the hero arrives from camp (tile coords). */
export const ACT1_SPAWN = { tx: 128, ty: 172 } as const;

/** The one puzzle room authored for the vertical slice (P2.E3 replaces). */
export const ACT1_LEVEL_TARGET = 'act1_area1_room1';

/** Marker kinds emitted into the object layer. */
export type Act1MarkerKind = 'puzzle' | 'boss' | 'portal';

/** One authored marker on the Act 1 overworld. */
export interface Act1MarkerDef {
  /** Stable object id, e.g. `puzzle_1`. */
  readonly id: string;
  readonly kind: Act1MarkerKind;
  /** Tile coordinates of the marker's cell. */
  readonly tx: number;
  readonly ty: number;
  /** Where "enter" goes: a level id, a boss id, or `hub`. */
  readonly target: string;
  /** i18n key for the marker's display name. */
  readonly labelKey: string;
}

/** The 8 puzzle clearings (spec 01 §3.1: 8 sub-areas per Act). */
const PUZZLE_SITES: ReadonlyArray<{ id: string; tx: number; ty: number }> = [
  { id: 'puzzle_1', tx: 64, ty: 58 },
  { id: 'puzzle_2', tx: 188, ty: 58 },
  { id: 'puzzle_3', tx: 34, ty: 96 },
  { id: 'puzzle_4', tx: 218, ty: 96 },
  { id: 'puzzle_5', tx: 64, ty: 134 },
  { id: 'puzzle_6', tx: 188, ty: 134 },
  { id: 'puzzle_7', tx: 96, ty: 160 },
  { id: 'puzzle_8', tx: 160, ty: 160 },
];

/** The boss brazier (spec 01 §3.1: 1 boss marker per Act). */
export const ACT1_BOSS = { id: 'boss', tx: 127, ty: 12 } as const;

/** The return portal beside the spawn stone. */
export const ACT1_PORTAL = { id: 'portal', tx: 121, ty: 173 } as const;

/** Authored marker list (8 puzzle + 1 boss + 1 portal). */
export const ACT1_MARKERS: readonly Act1MarkerDef[] = [
  ...PUZZLE_SITES.map(
    (s): Act1MarkerDef => ({
      id: s.id,
      kind: 'puzzle',
      tx: s.tx,
      ty: s.ty,
      target: ACT1_LEVEL_TARGET,
      labelKey: `acts:act_0.markers.${s.id}`,
    }),
  ),
  {
    id: ACT1_BOSS.id,
    kind: 'boss',
    tx: ACT1_BOSS.tx,
    ty: ACT1_BOSS.ty,
    target: 'nemean_lion',
    labelKey: 'acts:act_0.markers.boss',
  },
  {
    id: ACT1_PORTAL.id,
    kind: 'portal',
    tx: ACT1_PORTAL.tx,
    ty: ACT1_PORTAL.ty,
    target: 'hub',
    labelKey: 'acts:act_0.markers.portal',
  },
];

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/** Boss arena geometry (tile coords, inclusive). */
const ARENA = {
  floor: { x0: 104, y0: 6, x1: 151, y1: 30 },
  gate: { x0: 124, x1: 131 },
  wall: { top: 4, bottom: 32, left: 100, right: 155 },
} as const;

/** Clearing pad half-extents around each shrine tile. */
const PAD = { hx: 3, hy: 2 } as const;

/** Paint a rect of one GID (or GID producer) into a dense layer. */
function paintRect(
  layer: number[],
  mapW: number,
  mapH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gid: number | ((tx: number, ty: number) => number),
): void {
  for (let ty = Math.max(0, y0); ty <= Math.min(y1, mapH - 1); ty++) {
    for (let tx = Math.max(0, x0); tx <= Math.min(x1, mapW - 1); tx++) {
      layer[ty * mapW + tx] = typeof gid === 'function' ? gid(tx, ty) : gid;
    }
  }
}

/** Paint a rect OUTLINE (4 edges, 1 tile thick) into a dense layer. */
function paintFrame(
  layer: number[],
  mapW: number,
  mapH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gid: number | ((tx: number, ty: number) => number),
): void {
  paintRect(layer, mapW, mapH, x0, y0, x1, y0, gid);
  paintRect(layer, mapW, mapH, x0, y1, x1, y1, gid);
  paintRect(layer, mapW, mapH, x0, y0, x0, y1, gid);
  paintRect(layer, mapW, mapH, x1, y0, x1, y1, gid);
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------

/**
 * Generate the Act 1 overworld as a Tiled-JSON-shaped object.
 * Deterministic; the bake pipeline + contract tests validate it.
 */
export function buildAct1Overworld(
  firstgid: number,
  atlasWidth: number,
  atlasHeight: number,
): unknown {
  // Gid table = the FULL baked tileset order (demo tiles, then the
  // overworld extension) — must match generate-sprites exactly.
  const allTiles = [...buildTileset(), ...buildOverworldTiles()];
  const gidOf = new Map<string, number>();
  allTiles.forEach((t, i) => gidOf.set(t.name, firstgid + i));

  const W = ACT1_MAP_WIDTH;
  const H = ACT1_MAP_HEIGHT;
  const ground: number[] = new Array(W * H).fill(0);
  const obstacles: number[] = new Array(W * H).fill(0);
  const rand = mulberry32(0xac71f01);

  const gid = (name: string): number => {
    const v = gidOf.get(name);
    if (v === undefined) throw new Error(`act1Overworld: unknown tile "${name}"`);
    return v;
  };

  // ---- 1. Base meadow ----------------------------------------------------
  const grassIds = [gid('grass_0'), gid('grass_1'), gid('grass_2'), gid('grass_3')];
  for (let i = 0; i < W * H; i++) {
    const r = rand();
    ground[i] =
      r < 0.62
        ? grassIds[Math.floor(rand() * grassIds.length)]
        : r < 0.82
          ? gid('grass_tuft')
          : gid('grass_flowers');
  }

  // ---- 2. Cliff border ring (3 deep, solid) ------------------------------
  const cliffAt = (): number => (rand() > 0.5 ? gid('cliff_0') : gid('cliff_1'));
  for (let ring = 0; ring < 3; ring++) {
    paintFrame(ground, W, H, ring, ring, W - 1 - ring, H - 1 - ring, cliffAt);
  }

  // ---- 3. Boss arena (marble floor inside cliff walls + south gate) -------
  const arenaFloorAt = (): number =>
    rand() < 0.75 ? gid('stone_floor_0') : gid('stone_floor_1');
  paintRect(ground, W, H, ARENA.floor.x0, ARENA.floor.y0, ARENA.floor.x1, ARENA.floor.y1, arenaFloorAt);
  paintRect(ground, W, H, ARENA.wall.left, ARENA.wall.top, ARENA.wall.right, ARENA.floor.y0 - 1, cliffAt);
  paintRect(ground, W, H, ARENA.wall.left, ARENA.floor.y1 + 1, ARENA.gate.x0 - 1, ARENA.wall.bottom, cliffAt);
  paintRect(ground, W, H, ARENA.gate.x1 + 1, ARENA.floor.y1 + 1, ARENA.wall.right, ARENA.wall.bottom, cliffAt);
  paintRect(ground, W, H, ARENA.wall.left, ARENA.floor.y0, ARENA.wall.left + 2, ARENA.floor.y1, cliffAt);
  paintRect(ground, W, H, ARENA.wall.right - 2, ARENA.floor.y0, ARENA.wall.right, ARENA.floor.y1, cliffAt);
  // Gate posts + inner colonnade.
  for (const [cx, cy] of [
    [ARENA.gate.x0 - 1, ARENA.floor.y1 + 1],
    [ARENA.gate.x1 + 1, ARENA.floor.y1 + 1],
    [ARENA.floor.x0 + 4, ARENA.floor.y0 + 4],
    [ARENA.floor.x1 - 4, ARENA.floor.y0 + 4],
    [ARENA.floor.x0 + 4, ARENA.floor.y1 - 4],
    [ARENA.floor.x1 - 4, ARENA.floor.y1 - 4],
  ] as const) {
    obstacles[cy * W + cx] = gid('ruin_column');
  }

  // ---- 4. Dirt paths (2 wide, ragged) ------------------------------------
  const paintPath = (tx: number, ty: number): void => {
    if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3) return;
    // Ragged edge: the outer lane sometimes stays grass.
    const inner = ty % 2 === 0 || rand() > 0.25;
    if (!inner && rand() > 0.5) return;
    ground[ty * W + tx] = rand() > 0.3 ? gid('path_0') : gid('path_1');
  };
  const carveH = (x0: number, x1: number, y: number): void => {
    const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
    for (let x = a; x <= b; x++) {
      paintPath(x, y);
      paintPath(x, y + 1);
    }
  };
  const carveV = (x: number, y0: number, y1: number): void => {
    const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = a; y <= b; y++) {
      paintPath(x, y);
      paintPath(x + 1, y);
    }
  };

  const CX = 128; // central meadow column
  const CY = 96; // central meadow row
  // Spine: boss gate → center → spawn.
  carveV(CX, ARENA.gate.x0, ACT1_SPAWN.ty);
  // East/west high road.
  carveH(34, 218, CY);
  // North clearings.
  carveV(64, 58, CY);
  carveV(188, 58, CY);
  // Mid clearings.
  carveV(64, CY, 134);
  carveV(188, CY, 134);
  // South fork to the last two clearings.
  carveH(96, 160, 150);
  carveV(96, 150, 160);
  carveV(160, 150, 160);

  // ---- 5. Clearing pads (marble) around each shrine -----------------------
  for (const site of PUZZLE_SITES) {
    paintRect(
      ground,
      W,
      H,
      site.tx - PAD.hx,
      site.ty - PAD.hy,
      site.tx + PAD.hx,
      site.ty + PAD.hy,
      arenaFloorAt,
    );
    // Corner dressing.
    obstacles[(site.ty - PAD.hy) * W + (site.tx - PAD.hx)] = gid('rock');
    obstacles[(site.ty + PAD.hy) * W + (site.tx + PAD.hx)] = gid('bush');
  }

  // ---- 6. Spawn stone (obstacle layer so grass shows beneath) -------------
  obstacles[ACT1_SPAWN.ty * W + ACT1_SPAWN.tx] = gid('spawn_stone');

  // ---- 7. Spring pools (solid, single-tile) -------------------------------
  for (const [px, py] of [
    [110, 72],
    [156, 74],
    [80, 110],
    [176, 108],
    [48, 76],
    [208, 78],
    [44, 152],
    [212, 148],
    [110, 40],
    [148, 38],
  ] as const) {
    obstacles[py * W + px] = rand() > 0.5 ? gid('pond_0') : gid('pond_1');
  }

  // ---- 8. Wilds: trees / rocks / bushes with exclusion --------------------
  const isProtected = (tx: number, ty: number): boolean => {
    if (tx < 6 || ty < 6 || tx >= W - 6 || ty >= H - 6) return true;
    for (const site of PUZZLE_SITES) {
      if (Math.abs(tx - site.tx) <= PAD.hx + 2 && Math.abs(ty - site.ty) <= PAD.hy + 2) {
        return true;
      }
    }
    if (Math.abs(tx - ACT1_SPAWN.tx) <= 4 && Math.abs(ty - ACT1_SPAWN.ty) <= 4) return true;
    if (Math.abs(tx - ACT1_PORTAL.tx) <= 3 && Math.abs(ty - ACT1_PORTAL.ty) <= 3) return true;
    if (
      tx >= ARENA.wall.left - 2 &&
      tx <= ARENA.wall.right + 2 &&
      ty >= ARENA.wall.top - 2 &&
      ty <= ARENA.wall.bottom + 2
    ) {
      return true;
    }
    // Path lanes with a 1-tile margin.
    const onSpine = tx === CX || tx === CX + 1;
    const onRoad = ty === CY || ty === CY + 1;
    if (onSpine && ty >= ARENA.gate.x0 && ty <= ACT1_SPAWN.ty) return true;
    if (onRoad && tx >= 32 && tx <= 220) return true;
    if ((tx === 64 || tx === 188) && ty >= 56 && ty <= 136) return true;
    if (ty === 150 && tx >= 94 && tx <= 162) return true;
    if ((tx === 96 || tx === 160) && ty >= 148 && ty <= 162) return true;
    return false;
  };

  const occupied = new Set<number>();
  const tryProp = (tx: number, ty: number, tileGid: number): boolean => {
    if (isProtected(tx, ty)) return false;
    if (obstacles[ty * W + tx] !== 0) return false;
    // Minimum spacing so lanes stay readable.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (occupied.has((ty + dy) * W + (tx + dx))) return false;
      }
    }
    obstacles[ty * W + tx] = tileGid;
    occupied.add(ty * W + tx);
    return true;
  };

  for (let ty = 6; ty < H - 6; ty++) {
    for (let tx = 6; tx < W - 6; tx++) {
      const r = rand();
      if (r < 0.085) {
        const pick = rand();
        const tree =
          pick < 0.5 ? gid('tree_oak') : pick < 0.8 ? gid('tree_pine') : gid('tree_olive');
        tryProp(tx, ty, tree);
      } else if (r < 0.10) {
        tryProp(tx, ty, gid('rock'));
      } else if (r < 0.125) {
        tryProp(tx, ty, gid('bush'));
      }
    }
  }

  // ---- 9. Markers + spawn object group ------------------------------------
  const markerObjects: TiledMapObject[] = ACT1_MARKERS.map((m) => ({
    name: m.id,
    type: 'marker',
    x: m.tx * 16,
    y: m.ty * 16,
    width: 16,
    height: 16,
    properties: [
      { name: 'kind', type: 'string', value: m.kind },
      { name: 'target', type: 'string', value: m.target },
      { name: 'labelKey', type: 'string', value: m.labelKey },
    ],
  }));
  markerObjects.push({
    name: 'spawn',
    type: 'spawn',
    x: ACT1_SPAWN.tx * 16,
    y: ACT1_SPAWN.ty * 16,
    width: 16,
    height: 16,
    properties: [],
  });

  return tiledMapJson({
    name: 'act1_overworld',
    width: W,
    height: H,
    tileLayers: [
      { name: 'ground', data: ground },
      { name: 'obstacles', data: obstacles },
    ],
    objectGroups: [{ name: 'objects', objects: markerObjects }],
    firstgid,
    tilesetName: 'atlas_tiles',
    atlasWidth,
    atlasHeight,
  });
}
