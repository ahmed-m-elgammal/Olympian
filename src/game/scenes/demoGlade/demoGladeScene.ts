/**
 * Demo Glade scene — the P2.E1 acceptance world (spec 01 §3.1 shape;
 * P2.E2 replaces it with the authored Act 1 overworld).
 *
 * Assembles every piece the vertical slice needs from plain data:
 *
 *   baked map JSON ──▶ TileMap ──▶ TileCollisionSpace (obstacle layer)
 *   baked hero manifest ──▶ AnimationTable
 *   atlas registry ──▶ frameSizeOf + tile producer
 *   createHero @ {@link DEMO_SPAWN_TILE} ──▶ player entity
 *   systems in spec 07 §1.5 order ──▶ GameWorld
 *
 * The scene is engine-only (no React): the screen owns the GameLoop and
 * lifecycle; jest can step the world deterministically. `src` never
 * imports from `scripts/` — the spawn tile is pinned to the generator's
 * `DEMO_SPAWN` by `__tests__/game/demoGladeScene.test.ts` instead.
 *
 * @packageDocumentation
 */

import { inputStoreSource } from '@/data/stores/inputStore';
import { useRenderBus } from '@/data/stores/renderBus';
import { GAME_ZOOM } from '@/game/config/gameplay';
import { LAYERS } from '@/game/config/layers';
import { createHero } from '@/game/entities';
import { GameWorld } from '@/game/engine/GameWorld';
import type { FramePublisher } from '@/game/engine/GameWorld';
import { AnimationTable } from '@/game/engine/animation/AnimationTable';
import {
  createTileCommandProducer,
  type TileLayerSpec,
} from '@/game/engine/render/tileCommands';
import { TileCollisionSpace } from '@/game/engine/systems/collision';
import {
  createAnimationSystem,
  createCameraSystem,
  createInputSystem,
  createMovementSystem,
  type InputSource,
  type System,
} from '@/game/engine';
import type { EntityId } from '@/game/engine/ecs/World';
import type { World } from '@/game/engine/ecs/World';
import {
  ATLAS_IDS,
  animationManifestOf,
  frameSizeOf,
  tileEntries,
} from '@/game/render/atlas/atlasRegistry';
import { Camera } from '@/game/render/canvas/Camera';
import { TileMap, type TileMapData } from '@/game/render/tiles/TileMap';

import demoMapJson from '../../../../assets/tilemaps/demo_glade.json';

// ---------------------------------------------------------------------------
// Scene constants (all ids/layers tokenized — nothing inline)
// ---------------------------------------------------------------------------

/** Layer the collision space treats as solid. */
const OBSTACLE_LAYER = 'obstacles';

/** Map layers drawn as tiles, back → front by z-index. */
const TILE_LAYER_SPECS: readonly TileLayerSpec[] = [
  { name: 'ground', zIndex: LAYERS.ground },
  { name: OBSTACLE_LAYER, zIndex: LAYERS.props },
];

/**
 * Hero spawn in tile coordinates (feet land on the tile's bottom edge).
 * MUST match `DEMO_SPAWN` in `scripts/sprites/tileArt.ts` (the map
 * generator keeps a 3-tile clear radius around it) — pinned by test.
 */
export const DEMO_SPAWN_TILE = { tx: 14, ty: 20 } as const;

// ---------------------------------------------------------------------------
// Scene assembly
// ---------------------------------------------------------------------------

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
}

/** A assembled demo-glade world plus its key handles. */
export interface DemoGladeScene {
  /** The ECS world + camera + render buffer the GameLoop drives. */
  readonly gameWorld: GameWorld;
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

/** Render-bus adapter used when the caller supplies no publisher. */
const renderBusPublish: FramePublisher = (commands, camera) => {
  useRenderBus.getState().publish(commands, camera);
};

/**
 * Build the demo-glade scene. Throws loudly on contract violations
 * (missing manifest, missing obstacle layer) — a scene that cannot be
 * trusted at boot must not reach the first frame.
 */
export function createDemoGladeScene(
  opts: DemoGladeSceneOptions = {},
): DemoGladeScene {
  const publish = opts.publish ?? renderBusPublish;
  const inputSource = opts.inputSource ?? inputStoreSource;

  // ---- Map + collision --------------------------------------------------
  const map = new TileMap(demoMapJson as TileMapData);
  const firstgid = map.tilesets[0]?.firstgid ?? 1;
  // Tileset-local id = manifest order; global id = firstgid + local id.
  const solidGids = new Set<number>(
    tileEntries(ATLAS_IDS.tiles)
      .map((entry, index) => (entry.solid ? firstgid + index : -1))
      .filter((gid) => gid >= 0),
  );
  const collision = new TileCollisionSpace(map, solidGids, OBSTACLE_LAYER);

  // ---- Animations -------------------------------------------------------
  const animationTable = new AnimationTable(
    animationManifestOf(ATLAS_IDS.hero),
  );

  // ---- Camera -----------------------------------------------------------
  const camera = new Camera();
  camera.setZoom(GAME_ZOOM);

  // ---- Systems (spec 07 §1.5 order) -------------------------------------
  const systems: System[] = [
    createInputSystem(inputSource),
    createMovementSystem(collision, animationTable),
    createAnimationSystem(animationTable),
    createCameraSystem(camera, {
      width: map.getPixelWidth(),
      height: map.getPixelHeight(),
    }),
  ];

  // ---- World (owns the ECS) + hero ---------------------------------------
  const gameWorld = new GameWorld({
    collision,
    animations: animationTable,
    frameSizeOf,
    publish,
    tileProducer: createTileCommandProducer(map, camera, TILE_LAYER_SPECS),
    systems,
    camera,
  });

  const ecs = gameWorld.ecs;
  const tileW = map.getTileWidth();
  const tileH = map.getTileHeight();
  // Feet anchor: centered on the spawn tile's floor edge.
  const heroId = createHero(ecs, {
    x: (DEMO_SPAWN_TILE.tx + 0.5) * tileW,
    y: (DEMO_SPAWN_TILE.ty + 1) * tileH,
  });

  return { gameWorld, ecs, heroId, map, camera, animationTable };
}

export default createDemoGladeScene;
