/**
 * `act1_area1_room1` map generator (P2.E2.T7 shell) — a single-screen
 * puzzle room in the Nemean glade.
 *
 * P2.E2 needs a real room the overworld markers can lead into and exit
 * from (AC: "entering exits to the overworld"); the Reflex mechanic
 * that will fill its central grid is P2.E3 (spec 08 §3). The room is
 * therefore authored as a **puzzle shell**:
 *
 *   ┌────────── marble wall ring ──────────┐
 *   │  column        column       column   │
 *   │                                      │
 *   │        [ open floor — P2.E3 grid ]   │
 *   │                                      │
 *   │  column        exit portal   column  │
 *   │              [ spawn ]               │
 *   └──────────────────────────────────────┘
 *
 * The exit is a portal marker (kind `portal`, target `overworld`) the
 * LevelScreen reads from the map's object group — same mechanism as the
 * overworld, so the room swaps to a fully-authored puzzle later without
 * screen changes.
 *
 * @packageDocumentation
 */

import { mulberry32 } from '../sprites/pixelGrid';
import { buildTileset } from '../sprites/tileArt';
import { buildOverworldTiles } from '../sprites/overworldTiles';
import { tiledMapJson, type TiledMapObject } from './mapJson';

/** Room name = the level id it hosts (spec 01 §6.3 naming). */
export const ACT1_ROOM_ID = 'act1_area1_room1';

/** Room size in tiles (single screen). */
export const ACT1_ROOM_WIDTH = 30;
export const ACT1_ROOM_HEIGHT = 20;

/** Hero spawn (tile coords). */
export const ACT1_ROOM_SPAWN = { tx: 14, ty: 16 } as const;

/** Exit portal (tile coords) — walk over + tap to return to the overworld. */
export const ACT1_ROOM_EXIT = { tx: 14, ty: 5 } as const;

/** Wall ring depth (tiles). */
const WALL = 2;

/** i18n key for the exit marker + room title (acts namespace, act_0). */
export const ACT1_ROOM_EXIT_LABEL_KEY = 'acts:act_0.markers.exit';
export const ACT1_ROOM_TITLE_KEY = 'acts:act_0.levels.act1_area1_room1';

/**
 * Generate the room as a Tiled-JSON-shaped object. Deterministic.
 */
export function buildAct1Room(
  firstgid: number,
  atlasWidth: number,
  atlasHeight: number,
): unknown {
  const allTiles = [...buildTileset(), ...buildOverworldTiles()];
  const gidOf = new Map<string, number>();
  allTiles.forEach((t, i) => gidOf.set(t.name, firstgid + i));
  const gid = (name: string): number => {
    const v = gidOf.get(name);
    if (v === undefined) throw new Error(`act1Room: unknown tile "${name}"`);
    return v;
  };

  const W = ACT1_ROOM_WIDTH;
  const H = ACT1_ROOM_HEIGHT;
  const ground: number[] = new Array(W * H).fill(0);
  const obstacles: number[] = new Array(W * H).fill(0);
  const rand = mulberry32(0x100b01);

  // ---- Floor: grass with tufts -------------------------------------------
  const grassIds = [gid('grass_0'), gid('grass_1'), gid('grass_2'), gid('grass_3')];
  for (let i = 0; i < W * H; i++) {
    const r = rand();
    ground[i] =
      r < 0.7
        ? grassIds[Math.floor(rand() * grassIds.length)]
        : r < 0.9
          ? gid('grass_tuft')
          : gid('grass_flowers');
  }

  // ---- Central puzzle grid: worn marble (the P2.E3 playfield) ------------
  const gridX0 = 8;
  const gridY0 = 7;
  const gridX1 = W - 9;
  const gridY1 = 12;
  for (let ty = gridY0; ty <= gridY1; ty++) {
    for (let tx = gridX0; tx <= gridX1; tx++) {
      ground[ty * W + tx] =
        rand() < 0.75 ? gid('stone_floor_0') : gid('stone_floor_1');
    }
  }

  // ---- Wall ring (marble masonry, solid) ----------------------------------
  for (let ty = 0; ty < WALL; ty++) {
    for (let tx = 0; tx < W; tx++) {
      obstacles[ty * W + tx] = gid('stone_wall');
      obstacles[(H - 1 - ty) * W + tx] = gid('stone_wall');
    }
  }
  for (let tx = 0; tx < WALL; tx++) {
    for (let ty = 0; ty < H; ty++) {
      obstacles[ty * W + tx] = gid('stone_wall');
      obstacles[ty * W + (W - 1 - tx)] = gid('stone_wall');
    }
  }

  // ---- Dressing: corner columns + side bushes -----------------------------
  for (const [cx, cy] of [
    [WALL + 1, WALL + 1],
    [W - WALL - 2, WALL + 1],
    [WALL + 1, H - WALL - 2],
    [W - WALL - 2, H - WALL - 2],
  ] as const) {
    obstacles[cy * W + cx] = gid('ruin_column');
  }
  obstacles[(WALL + 1) * W + 10] = gid('bush');
  obstacles[(H - WALL - 2) * W + (W - 11)] = gid('bush');

  // ---- Spawn pad (obstacle layer so the floor shows beneath) --------------
  obstacles[ACT1_ROOM_SPAWN.ty * W + ACT1_ROOM_SPAWN.tx] = gid('spawn_stone');

  // ---- Objects: spawn + exit portal ---------------------------------------
  const objects: TiledMapObject[] = [
    {
      name: 'spawn',
      type: 'spawn',
      x: ACT1_ROOM_SPAWN.tx * 16,
      y: ACT1_ROOM_SPAWN.ty * 16,
      width: 16,
      height: 16,
      properties: [],
    },
    {
      name: 'exit',
      type: 'marker',
      x: ACT1_ROOM_EXIT.tx * 16,
      y: ACT1_ROOM_EXIT.ty * 16,
      width: 16,
      height: 16,
      properties: [
        { name: 'kind', type: 'string', value: 'portal' },
        { name: 'target', type: 'string', value: 'overworld' },
        { name: 'labelKey', type: 'string', value: ACT1_ROOM_EXIT_LABEL_KEY },
      ],
    },
  ];

  return tiledMapJson({
    name: ACT1_ROOM_ID,
    width: W,
    height: H,
    tileLayers: [
      { name: 'ground', data: ground },
      { name: 'obstacles', data: obstacles },
    ],
    objectGroups: [{ name: 'objects', objects }],
    firstgid,
    tilesetName: 'atlas_tiles',
    atlasWidth,
    atlasHeight,
  });
}
