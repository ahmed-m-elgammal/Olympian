/**
 * Field scene builder — shared assembly for every walkable map scene
 * (overworld / puzzle room; spec 07 §1.5, §5).
 *
 * One implementation of the whole stack so no scene hand-rolls it:
 *
 *   baked map JSON ──▶ TileMap ──▶ TileCollisionSpace
 *   atlas manifests ──▶ merged AnimationTable (hero + tiles)
 *   SceneSpec ──▶ systems (input → movement → animation → marker →
 *   camera) + entities (hero / markers) ──▶ GameWorld
 *
 * The builder is created once per screen with its seams (tilemap
 * resolver, marker-focus sink, input source, frame publisher) and then
 * reused for every `loadScene` — the SceneManager treats it as the
 * engine's `SceneBuilder`.
 *
 * @packageDocumentation
 */

import { inputStoreSource } from '@/data/stores/inputStore';
import { useRenderBus } from '@/data/stores/renderBus';
import { GAME_ZOOM, MARKER_INTERACT_RADIUS_PX } from '@/game/config/gameplay';
import { LAYERS } from '@/game/config/layers';
import { createHero } from '@/game/entities';
import { createMarkerEntity } from '@/game/entities/marker/createMarker';
import { GameWorld } from '@/game/engine/GameWorld';
import type { FramePublisher } from '@/game/engine/GameWorld';
import { AnimationTable } from '@/game/engine/animation/AnimationTable';
import type { AnimationManifest } from '@/game/engine/animation/AnimationTable';
import {
  createAnimationSystem,
  createCameraSystem,
  createInputSystem,
  createMarkerSystem,
  createMovementSystem,
  type InputSource,
  type MarkerFocusSink,
  type SceneHandle,
} from '@/game/engine';
import type { SceneBuilder, SceneSpec } from '@/game/engine/scene/types';
import type { HeroEntitySpec, MarkerEntitySpec } from '@/game/engine/scene/types';
import {
  createTileCommandProducer,
  type TileLayerSpec,
} from '@/game/engine/render/tileCommands';
import { TileCollisionSpace } from '@/game/engine/systems/collision';
import { clampCameraTo } from '@/game/engine/systems/CameraSystem';
import type { World, EntityId } from '@/game/engine/ecs/World';
import {
  ATLAS_IDS,
  animationManifestOf,
  frameSizeOf,
  tileEntries,
} from '@/game/render/atlas/atlasRegistry';
import { Camera } from '@/game/render/canvas/Camera';
import { TileMap, type TileMapData } from '@/game/render/tiles/TileMap';

/** Layer the collision space treats as solid. */
const OBSTACLE_LAYER = 'obstacles';

/** Map layers drawn as tiles, back → front by z-index. */
const TILE_LAYER_SPECS: readonly TileLayerSpec[] = [
  { name: 'ground', zIndex: LAYERS.ground },
  { name: OBSTACLE_LAYER, zIndex: LAYERS.props },
];

/** Render-bus adapter used when the caller supplies no publisher. */
const renderBusPublish: FramePublisher = (commands, camera) => {
  useRenderBus.getState().publish(commands, camera);
};

/** Deps the builder needs from the app layer (all injectable for tests). */
export interface FieldSceneDeps {
  /** Resolves a SceneSpec.tilemap id to its baked Tiled JSON. */
  readonly resolveTilemap: (id: string) => TileMapData;
  /** Marker focus sink (interaction store adapter). */
  readonly focusSink: MarkerFocusSink;
  /** Analog input source. Defaults to the inputStore adapter. */
  readonly inputSource?: InputSource;
  /** Frame consumer. Defaults to the render-bus adapter. */
  readonly publish?: FramePublisher;
}

/**
 * Create a {@link SceneBuilder} for field scenes. Throws loudly on
 * contract violations (missing tilemap id, missing obstacle layer) —
 * a scene that cannot be trusted at boot must not reach the first frame.
 */
export function createFieldSceneBuilder(deps: FieldSceneDeps): SceneBuilder {
  return (spec: SceneSpec): SceneHandle => {
    if (!spec.tilemap) {
      throw new Error(`fieldScene: scene "${spec.id}" has no tilemap id`);
    }

    // ---- Map + collision ------------------------------------------------
    const map = new TileMap(deps.resolveTilemap(spec.tilemap));
    const firstgid = map.tilesets[0]?.firstgid ?? 1;
    // Tileset-local id = manifest order; global id = firstgid + local id.
    const solidGids = new Set<number>(
      tileEntries(ATLAS_IDS.tiles)
        .map((entry, index) => (entry.solid ? firstgid + index : -1))
        .filter((gid) => gid >= 0),
    );
    const collision = new TileCollisionSpace(map, solidGids, OBSTACLE_LAYER);

    // ---- Animations (hero + tiles marker loops, merged) ------------------
    const manifest: AnimationManifest = {
      ...animationManifestOf(ATLAS_IDS.tiles),
      ...animationManifestOf(ATLAS_IDS.hero),
    };
    const animationTable = new AnimationTable(manifest);

    // ---- Camera (zoomed + snapped to the spawn, clamped to the map) ------
    const camera = new Camera();
    camera.setZoom(GAME_ZOOM);
    const mapBounds = { width: map.getPixelWidth(), height: map.getPixelHeight() };
    camera.follow(spec.playerSpawn, 1);
    clampCameraTo(camera, mapBounds);

    // ---- Systems (spec 07 §1.5 order; markers before camera) -------------
    const systems = [
      createInputSystem(deps.inputSource ?? inputStoreSource),
      createMovementSystem(collision, animationTable),
      createAnimationSystem(animationTable),
      createMarkerSystem(deps.focusSink),
      createCameraSystem(camera, mapBounds),
    ];

    // ---- World + entities -------------------------------------------------
    const gameWorld = new GameWorld({
      collision,
      animations: animationTable,
      frameSizeOf,
      publish: deps.publish ?? renderBusPublish,
      tileProducer: createTileCommandProducer(map, camera, TILE_LAYER_SPECS),
      systems,
      camera,
    });

    const ecs = gameWorld.ecs;
    const entityIds: EntityId[] = spec.entities.map((entity) =>
      entity.kind === 'hero' ? spawnHero(ecs, entity) : spawnMarker(ecs, entity),
    );

    return { gameWorld, camera, entityIds, map, animations: animationTable };
  };
}

/**
 * Snap the camera to a world target (used by screens after the canvas
 * reports its real viewport, so a scene never pans in from a corner).
 */
export function snapCameraTo(
  camera: Camera,
  target: { x: number; y: number },
  bounds: { width: number; height: number },
): void {
  camera.follow(target, 1);
  clampCameraTo(camera, bounds);
}

/** Spawn the hero from its spec. */
function spawnHero(ecs: World, entity: HeroEntitySpec): EntityId {
  return createHero(ecs, {
    x: entity.x,
    y: entity.y,
    ...(entity.facing ? { facing: entity.facing } : {}),
  });
}

/** Spawn a walk-over marker from its spec. */
function spawnMarker(ecs: World, entity: MarkerEntitySpec): EntityId {
  return createMarkerEntity(ecs, {
    markerId: entity.markerId,
    markerKind: entity.markerKind,
    x: entity.x,
    y: entity.y,
    target: entity.target,
    labelKey: entity.labelKey,
    radiusPx: entity.radiusPx ?? MARKER_INTERACT_RADIUS_PX,
    sprite: entity.sprite,
  });
}
