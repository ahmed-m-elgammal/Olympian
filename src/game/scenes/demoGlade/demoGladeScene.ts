/**
 * Demo Glade scene — the P2.E1 acceptance world (spec 01 §3.1 shape).
 *
 * Since P2.E2 the shared {@link createFieldSceneBuilder} assembles every
 * field scene; the demo glade is now a compact SceneSpec over the baked
 * demo map (no markers, hero at the generator's kept-clear spawn). It
 * remains the engine's integration fixture: the ECS/system/scene tests
 * step it deterministically, and `src` never imports from `scripts/` —
 * the spawn tile is pinned to the generator's `DEMO_SPAWN` by
 * `__tests__/game/demoGladeScene.test.ts` instead.
 *
 * @packageDocumentation
 */

import type { InputSource } from '@/game/engine';
import type { FramePublisher } from '@/game/engine/GameWorld';
import type { MarkerFocusSink, SceneHandle } from '@/game/engine';
import { createFieldSceneBuilder } from '@/game/scenes/fieldScene';
import { resolveTilemap, MAP_IDS } from '@/game/scenes/mapAssets';
import type { EntityId } from '@/game/engine/ecs/World';
import type { World } from '@/game/engine/ecs/World';
import type { AnimationTable } from '@/game/engine/animation/AnimationTable';
import { TileMap } from '@/game/render/tiles/TileMap';
import { Camera } from '@/game/render/canvas/Camera';

// ---------------------------------------------------------------------------
// Scene constants (all ids/layers tokenized — nothing inline)
// ---------------------------------------------------------------------------

/**
 * Hero spawn in tile coordinates (feet land on the tile's bottom edge).
 * MUST match `DEMO_SPAWN` in `scripts/sprites/tileArt.ts` (the map
 * generator keeps a 3-tile clear radius around it) — pinned by test.
 */
export const DEMO_SPAWN_TILE = { tx: 14, ty: 20 } as const;

/** Options for {@link createDemoGladeScene}. */
export interface DemoGladeSceneOptions {
  /**
   * Frame consumer. Defaults to the Zustand render-bus adapter; tests
   * capture frames with a stub.
   */
  readonly publish?: FramePublisher;
  /**
   * Analog input source. Defaults to the `inputStore` adapter; tests
   * inject a stub.
   */
  readonly inputSource?: InputSource;
  /**
   * Marker focus sink. The demo glade has no markers, but the sink is
   * required by the shared builder; tests inject a spy if needed.
   */
  readonly focusSink?: MarkerFocusSink;
}

/** A assembled demo-glade world plus its key handles. */
export interface DemoGladeScene {
  /** The ECS world + camera + render buffer the GameLoop drives. */
  readonly gameWorld: SceneHandle['gameWorld'];
  /** The ECS store (`gameWorld.ecs` — for assertions / extras). */
  readonly ecs: World;
  /** Hero entity id. */
  readonly heroId: EntityId;
  /** Parsed map (bounds, layers, tile lookups). */
  readonly map: TileMap;
  /** Camera (the screen feeds it a viewport on layout). */
  readonly camera: Camera;
  /** Animation registry (gameplay transitions). */
  readonly animationTable: AnimationTable;
}

/** No-op focus sink (the demo map has no markers to focus). */
const noopFocusSink: MarkerFocusSink = {
  focus: () => undefined,
  blur: () => undefined,
};

/**
 * Build the demo-glade scene via the shared field builder. Throws
 * loudly on contract violations (missing manifest, missing obstacle
 * layer) — a scene that cannot be trusted at boot must not reach the
 * first frame.
 */
export function createDemoGladeScene(
  opts: DemoGladeSceneOptions = {},
): DemoGladeScene {
  // Tile size comes from the baked map — no literal in scene code.
  const { tilewidth: tileW, tileheight: tileH } = resolveTilemap(MAP_IDS.demoGlade);
  const spawn = {
    x: (DEMO_SPAWN_TILE.tx + 0.5) * tileW,
    y: (DEMO_SPAWN_TILE.ty + 1) * tileH,
  };
  const spec = {
    type: 'overworld' as const,
    id: MAP_IDS.demoGlade,
    tilemap: MAP_IDS.demoGlade,
    entities: [{ kind: 'hero' as const, x: spawn.x, y: spawn.y }],
    music: 'tutorial',
    playerSpawn: spawn,
  };

  const buildScene = createFieldSceneBuilder({
    resolveTilemap,
    focusSink: opts.focusSink ?? noopFocusSink,
    ...(opts.inputSource ? { inputSource: opts.inputSource } : {}),
    ...(opts.publish ? { publish: opts.publish } : {}),
  });

  const handle = buildScene(spec);
  const heroId = handle.entityIds[0];

  return {
    gameWorld: handle.gameWorld,
    ecs: handle.gameWorld.ecs,
    heroId,
    map: handle.map as TileMap,
    camera: handle.camera,
    animationTable: handle.animations as AnimationTable,
  };
}

export default createDemoGladeScene;
