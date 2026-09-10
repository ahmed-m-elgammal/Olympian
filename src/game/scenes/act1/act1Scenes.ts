/**
 * Act 1 scene specs (P2.E2.T1–T2, T5, T7) — content wiring between the
 * baked maps and the engine's `SceneSpec`.
 *
 * The overworld spec is built FROM the baked map's object layer, so the
 * map JSON is the single source of truth for spawn + marker placement
 * (authored by the generator, pinned by `__tests__/game/act1Maps.test.ts`).
 *
 * Audio ids follow the seed data: act_number 0 ("The Nemean Lion") uses
 * the `tutorial` music track + `amb_act1` bed (data/seed/acts.json and
 * the Act 0 audio manifest in `platform/audio/preload.ts`).
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type {
  EntitySpec,
  SceneSpec,
} from '@/game/engine/scene/types';
import type { MapObject } from '@/game/render/tiles/TileMap';

import { resolveTilemap, MAP_IDS } from '../mapAssets';
import { ATLAS_IDS } from '@/game/render/atlas/atlasRegistry';

// ---------------------------------------------------------------------------
// Scene + audio ids (data/seed/acts.json act_number 0)
// ---------------------------------------------------------------------------

/** Stable scene ids. */
export const SCENE_IDS = {
  act1Overworld: 'act1_overworld',
  act1Area1Room1: 'act1_area1_room1',
} as const;

/**
 * Marker art wiring per marker kind — the tiles atlas' animated loops
 * (pulsing shrine / flickering brazier / swirling portal). Referenced
 * by the map-object → EntitySpec conversion below.
 */
export const MARKER_SPRITES: Readonly<
  Record<'puzzle' | 'boss' | 'portal', { atlasId: string; animationKey: string; frameId: string }>
> = {
  puzzle: { atlasId: ATLAS_IDS.tiles, animationKey: 'marker_shrine', frameId: 'shrine_0' },
  boss: { atlasId: ATLAS_IDS.tiles, animationKey: 'marker_brazier', frameId: 'brazier_0' },
  portal: { atlasId: ATLAS_IDS.tiles, animationKey: 'marker_portal', frameId: 'portal_0' },
};

/** Music + ambience for Act 0 scenes (see preload.ts ACT_AUDIO_MANIFEST). */
export const ACT0_MUSIC = 'tutorial';
export const ACT0_AMBIENCE = 'amb_act1';

/** Object-layer names the scenes read (must match the baked maps). */
const OBJECTS_LAYER = 'objects';
const OBJECT_TYPE_MARKER = 'marker';
const OBJECT_TYPE_SPAWN = 'spawn';

/** Every level id that has an authored room (P2.E3 grows this). */
export const LEVEL_IDS = {
  act1Area1Room1: SCENE_IDS.act1Area1Room1,
} as const;

/** i18n keys for level titles (acts namespace, act_0). */
export const LEVEL_TITLE_KEYS: Readonly<Record<string, string>> = {
  [LEVEL_IDS.act1Area1Room1]: 'acts:act_0.levels.act1_area1_room1',
};

/** Owning act (route param) per level id — rooms return to their act. */
export const LEVEL_ACTS: Readonly<Record<string, number>> = {
  [LEVEL_IDS.act1Area1Room1]: 0,
};

// ---------------------------------------------------------------------------
// Map objects → entity specs
// ---------------------------------------------------------------------------

/** Marker px offsets from the object's top-left to its feet anchor. */
const MARKER_FEET_OFFSET_X = 8;
const MARKER_FEET_OFFSET_Y = 16;

/**
 * Convert a baked map's object layer into entity specs + spawn point.
 * Markers become walk-over entities; the spawn object becomes the
 * player spawn. Unknown object types are warned and skipped (content
 * additions must never crash the boot path).
 */
export function entitiesFromMapObjects(objects: readonly MapObject[]): {
  entities: EntitySpec[];
  playerSpawn: { x: number; y: number };
} {
  const entities: EntitySpec[] = [];
  let playerSpawn: { x: number; y: number } | null = null;

  for (const obj of objects) {
    if (obj.type === OBJECT_TYPE_SPAWN) {
      playerSpawn = { x: obj.x + MARKER_FEET_OFFSET_X, y: obj.y + MARKER_FEET_OFFSET_Y };
      continue;
    }
    if (obj.type !== OBJECT_TYPE_MARKER) {
      logger.warn(`act1Scenes: unknown object type "${obj.type}" (${obj.name}) — skipped`);
      continue;
    }
    const markerKind = obj.properties.kind;
    const target = obj.properties.target;
    const labelKey = obj.properties.labelKey;
    if (typeof markerKind !== 'string' || typeof target !== 'string' || typeof labelKey !== 'string') {
      logger.warn(`act1Scenes: marker "${obj.name}" is missing kind/target/labelKey — skipped`);
      continue;
    }
    if (markerKind !== 'puzzle' && markerKind !== 'boss' && markerKind !== 'portal') {
      logger.warn(`act1Scenes: marker "${obj.name}" has unknown kind "${markerKind}" — skipped`);
      continue;
    }
    entities.push({
      kind: 'marker',
      markerId: obj.name,
      markerKind,
      x: obj.x + MARKER_FEET_OFFSET_X,
      y: obj.y + MARKER_FEET_OFFSET_Y,
      target,
      labelKey,
      sprite: MARKER_SPRITES[markerKind],
    });
  }

  if (!playerSpawn) {
    throw new Error('act1Scenes: map has no spawn object');
  }
  return { entities, playerSpawn };
}

// ---------------------------------------------------------------------------
// Scene spec factories
// ---------------------------------------------------------------------------

/** Route param → scene id for overworlds. Only Act 0 is authored. */
export function overworldSceneIdForAct(act: number): string {
  if (act !== 0) {
    throw new Error(`act1Scenes: act ${act} has no authored overworld yet`);
  }
  return SCENE_IDS.act1Overworld;
}

/**
 * Build the Act 1 overworld spec (spec 07 §5.1 step 2:
 * `loadScene({ type: 'overworld', id: 'act1_overworld' })`).
 */
export function overworldSpecForAct(act: number): SceneSpec {
  const sceneId = overworldSceneIdForAct(act);
  const { entities, playerSpawn } = entitiesFromMapObjects(readMapObjects(sceneId));
  return {
    type: 'overworld',
    id: sceneId,
    tilemap: sceneId,
    entities: [{ kind: 'hero', x: playerSpawn.x, y: playerSpawn.y }, ...entities],
    music: ACT0_MUSIC,
    ambience: ACT0_AMBIENCE,
    ambientLight: 'day',
    playerSpawn,
  };
}

/**
 * Build a puzzle-room spec for `levelId` (spec 07 §5.1 step 3).
 * Throws on unknown ids — the overworld markers only target authored
 * rooms.
 */
export function levelSpec(levelId: string): SceneSpec {
  if (levelId !== LEVEL_IDS.act1Area1Room1) {
    throw new Error(`act1Scenes: unknown level "${levelId}" (P2.E3 authors the real rooms)`);
  }
  const { entities, playerSpawn } = entitiesFromMapObjects(readMapObjects(levelId));
  return {
    type: 'level',
    id: levelId,
    tilemap: MAP_IDS.act1Area1Room1,
    entities: [{ kind: 'hero', x: playerSpawn.x, y: playerSpawn.y }, ...entities],
    music: ACT0_MUSIC,
    ambience: ACT0_AMBIENCE,
    ambientLight: 'day',
    playerSpawn,
  };
}

/** Read the `objects` layer of a registered map (asserts it exists). */
function readMapObjects(mapId: string): readonly MapObject[] {
  const json = resolveTilemap(mapId);
  const group = json.layers.find(
    (l): l is { name: string; type: 'objectgroup'; objects: RawMapObject[] } =>
      l.type === 'objectgroup' && l.name === OBJECTS_LAYER,
  );
  if (!group) {
    throw new Error(`act1Scenes: map "${mapId}" has no "${OBJECTS_LAYER}" objectgroup`);
  }
  return group.objects.map((o) => ({
    name: o.name ?? '',
    type: o.type ?? '',
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: o.width ?? 0,
    height: o.height ?? 0,
    // The baked JSON carries Tiled's canonical `[{name, type, value}]`
    // property form — flatten to the record the runtime works with.
    properties: Object.fromEntries(
      (o.properties ?? []).map((p) => [p.name, p.value]),
    ) as MapObject['properties'],
  }));
}

/** Object shape in the raw baked JSON (before property flattening). */
interface RawMapObject {
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: ReadonlyArray<{ name: string; value: unknown }>;
}
