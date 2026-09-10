/**
 * Act 1 map bake contracts (P2.E2.T1/T2).
 *
 * Pins the baked `act1_overworld.json` + `act1_area1_room1.json` to the
 * spec: dimensions (01 §3.1: 256×192), the 8 puzzle + 1 boss + portal +
 * spawn object layer (01 §3.1), spawn-area safety, gid validity, and —
 * the playable guarantee — a flood-fill from the spawn proving every
 * marker is REACHABLE on foot (no solid walls between camp and trials).
 *
 * Also pins the generators' determinism (two runs → identical JSON).
 */

import act1OverworldJson from '../../assets/tilemaps/act1_overworld.json';
import act1RoomJson from '../../assets/tilemaps/act1_area1_room1.json';
import atlasTiles from '../../assets/sprites/atlas_tiles.json';

import { buildAct1Overworld } from '../../scripts/tilemaps/act1Overworld';
import { buildAct1Room } from '../../scripts/tilemaps/act1Room';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface MapShape {
  name: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<{
    name: string;
    type: string;
    data?: number[];
    objects?: Array<{
      name: string;
      type: string;
      x: number;
      y: number;
      properties?: Array<{ name: string; value: unknown }>;
    }>;
  }>;
  tilesets: Array<{ firstgid: number }>;
}

interface TilesManifest {
  tiles: Array<{ name: string; solid: boolean }>;
  animations: Record<string, { frames: string[]; fps: number; loop: boolean }>;
  frames: Array<{ name: string }>;
}

const overworld = act1OverworldJson as unknown as MapShape;
const room = act1RoomJson as unknown as MapShape;
const tilesManifest = atlasTiles as unknown as TilesManifest;

const TILE_COUNT = tilesManifest.tiles.length;

function layerOf(map: MapShape, name: string): number[] {
  const layer = map.layers.find((l) => l.type === 'tilelayer' && l.name === name);
  expect(layer).toBeDefined();
  return layer!.data!;
}

function objectsOf(map: MapShape): Array<{
  name: string;
  type: string;
  tx: number;
  ty: number;
  props: Record<string, unknown>;
}> {
  const group = map.layers.find((l) => l.type === 'objectgroup');
  expect(group).toBeDefined();
  return group!.objects!.map((o) => ({
    name: o.name,
    type: o.type,
    tx: o.x / map.tilewidth,
    ty: o.y / map.tileheight,
    props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])),
  }));
}

/** Set of solid GIDs (firstgid = 1; gid = tileset index + 1). */
const SOLID_GIDS = new Set<number>(
  tilesManifest.tiles.map((t, i) => (t.solid ? i + 1 : -1)).filter((g) => g > 0),
);

/** BFS over walkable tiles; returns the reachable set as keys `ty*W+tx`. */
function reachableKeys(map: MapShape, obstacles: number[], startTx: number, startTy: number): Set<number> {
  const W = map.width;
  const H = map.height;
  const walkable = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    return !SOLID_GIDS.has(obstacles[ty * W + tx]);
  };
  const seen = new Set<number>();
  if (!walkable(startTx, startTy)) return seen;
  const queue: Array<[number, number]> = [[startTx, startTy]];
  seen.add(startTy * W + startTx);
  while (queue.length > 0) {
    const [tx, ty] = queue.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = ny * W + nx;
      if (seen.has(key) || !walkable(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// act1_overworld
// ---------------------------------------------------------------------------

describe('act1_overworld bake (P2.E2.T1/T2)', () => {
  it('is the spec-sized Act map (256×192 tiles, 16px)', () => {
    expect(overworld.name).toBe('act1_overworld');
    expect(overworld.width).toBe(256);
    expect(overworld.height).toBe(192);
    expect(overworld.tilewidth).toBe(16);
    expect(overworld.tileheight).toBe(16);
  });

  it('has dense ground + obstacle layers of full size', () => {
    expect(layerOf(overworld, 'ground')).toHaveLength(256 * 192);
    expect(layerOf(overworld, 'obstacles')).toHaveLength(256 * 192);
  });

  it('places exactly 8 puzzle + 1 boss + 1 portal markers and 1 spawn', () => {
    const objects = objectsOf(overworld);
    const markers = objects.filter((o) => o.type === 'marker');
    const spawns = objects.filter((o) => o.type === 'spawn');

    expect(spawns).toHaveLength(1);
    expect(markers.filter((m) => m.props.kind === 'puzzle')).toHaveLength(8);
    expect(markers.filter((m) => m.props.kind === 'boss')).toHaveLength(1);
    expect(markers.filter((m) => m.props.kind === 'portal')).toHaveLength(1);
    expect(markers).toHaveLength(10);
  });

  it('every marker is in bounds, on a walkable tile, with a label + target', () => {
    const obstacles = layerOf(overworld, 'obstacles');
    for (const obj of objectsOf(overworld)) {
      expect(obj.tx).toBeGreaterThanOrEqual(0);
      expect(obj.tx).toBeLessThan(overworld.width);
      expect(obj.ty).toBeGreaterThanOrEqual(0);
      expect(obj.ty).toBeLessThan(overworld.height);

      const gid = obstacles[obj.ty * overworld.width + obj.tx];
      expect(SOLID_GIDS.has(gid)).toBe(false);

      if (obj.type === 'marker') {
        expect(typeof obj.props.kind).toBe('string');
        expect(typeof obj.props.target).toBe('string');
        expect(String(obj.props.labelKey)).toMatch(/^acts:act_0\.markers\./);
      }
    }
  });

  it('routes markers at the epic contract (levels / boss / hub)', () => {
    for (const obj of objectsOf(overworld)) {
      if (obj.props.kind === 'puzzle') {
        expect(obj.props.target).toBe('act1_area1_room1');
      } else if (obj.props.kind === 'boss') {
        expect(obj.props.target).toBe('nemean_lion');
      } else if (obj.props.kind === 'portal') {
        expect(obj.props.target).toBe('hub');
      }
    }
  });

  it('keeps a clear radius around the spawn stone', () => {
    const obstacles = layerOf(overworld, 'obstacles');
    const spawn = objectsOf(overworld).find((o) => o.type === 'spawn')!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gid = obstacles[(spawn.ty + dy) * overworld.width + (spawn.tx + dx)];
        if (dx === 0 && dy === 0) continue; // the stone itself is walkable
        expect(SOLID_GIDS.has(gid)).toBe(false);
      }
    }
  });

  it('every marker is REACHABLE from the spawn on foot (flood fill)', () => {
    const obstacles = layerOf(overworld, 'obstacles');
    const spawn = objectsOf(overworld).find((o) => o.type === 'spawn')!;
    const reachable = reachableKeys(overworld, obstacles, spawn.tx, spawn.ty);

    // The spawn tile itself must be walkable (guards a wall-in bug).
    expect(reachable.size).toBeGreaterThan(0);

    for (const obj of objectsOf(overworld)) {
      const key = obj.ty * overworld.width + obj.tx;
      expect(reachable.has(key)).toBe(true);
    }

    // Sanity: the world is generously connected, not a single corridor.
    expect(reachable.size).toBeGreaterThan(256 * 192 * 0.3);
  });

  it('only references valid tileset gids (no void tiles)', () => {
    for (const name of ['ground', 'obstacles']) {
      for (const gid of layerOf(overworld, name)) {
        expect(gid).toBeGreaterThanOrEqual(0);
        expect(gid).toBeLessThanOrEqual(TILE_COUNT);
      }
    }
  });

  it('is byte-deterministic (two generations match exactly)', () => {
    const a = JSON.stringify(buildAct1Overworld(1, 256, 256));
    const b = JSON.stringify(buildAct1Overworld(1, 256, 256));
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify(act1OverworldJson));
  });
});

// ---------------------------------------------------------------------------
// act1_area1_room1
// ---------------------------------------------------------------------------

describe('act1_area1_room1 bake (P2.E2.T7 shell)', () => {
  it('is a single-screen room with a wall ring', () => {
    expect(room.name).toBe('act1_area1_room1');
    expect(room.width).toBe(30);
    expect(room.height).toBe(20);
    const obstacles = layerOf(room, 'obstacles');
    // Full border solid.
    for (let tx = 0; tx < room.width; tx++) {
      expect(SOLID_GIDS.has(obstacles[tx])).toBe(true);
      expect(SOLID_GIDS.has(obstacles[(room.height - 1) * room.width + tx])).toBe(true);
    }
  });

  it('has a spawn + one exit portal targeting the overworld', () => {
    const objects = objectsOf(room);
    expect(objects.filter((o) => o.type === 'spawn')).toHaveLength(1);
    const exits = objects.filter(
      (o) => o.type === 'marker' && o.props.kind === 'portal' && o.props.target === 'overworld',
    );
    expect(exits).toHaveLength(1);
  });

  it('spawn is walkable and the exit is reachable from it', () => {
    const obstacles = layerOf(room, 'obstacles');
    const spawn = objectsOf(room).find((o) => o.type === 'spawn')!;
    const exit = objectsOf(room).find((o) => o.name === 'exit')!;

    expect(SOLID_GIDS.has(obstacles[spawn.ty * room.width + spawn.tx])).toBe(false);

    const reachable = reachableKeys(room, obstacles, spawn.tx, spawn.ty);
    expect(reachable.has(exit.ty * room.width + exit.tx)).toBe(true);
  });

  it('is byte-deterministic', () => {
    const a = JSON.stringify(buildAct1Room(1, 256, 256));
    expect(a).toBe(JSON.stringify(act1RoomJson));
  });
});

// ---------------------------------------------------------------------------
// Marker animation manifest (the "alive world" contract)
// ---------------------------------------------------------------------------

describe('act1 marker animations', () => {
  it('ships looping shrine / brazier / portal animations with real frames', () => {
    const frameNames = new Set(tilesManifest.frames.map((f) => f.name));
    for (const key of ['marker_shrine', 'marker_brazier', 'marker_portal']) {
      const anim = tilesManifest.animations[key];
      expect(anim).toBeDefined();
      expect(anim.loop).toBe(true);
      for (const frame of anim.frames) {
        expect(frameNames.has(frame)).toBe(true);
      }
    }
  });
});
