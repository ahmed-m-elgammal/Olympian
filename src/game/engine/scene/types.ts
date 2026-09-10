/**
 * Scene-management types (spec 07 §5).
 *
 * A `SceneSpec` is the plain-data description of one playable scene:
 * which map, which entities, which music. The {@link SceneManager}
 * consumes specs through two injected seams so the engine stays
 * framework-free:
 *
 *  - {@link SceneBuilder} — turns a spec into a live {@link SceneHandle}
 *    (parses the tilemap, assembles systems, spawns entities);
 *  - {@link SceneAudioBridge} — applies the spec's music/ambience
 *    (production adapter cross-fades the platform audio players).
 *
 * @packageDocumentation
 */

import type { Camera } from '@/game/render/canvas/Camera';
import type { FacingDir, MarkerKind } from '../ecs/components';
import type { GameWorld } from '../GameWorld';

/** Scene categories per spec 07 §5. */
export type SceneType = 'overworld' | 'level' | 'boss' | 'hub';

/** Ambient lighting mood (spec 07 §5 SceneSpec; consumed by the FX epic). */
export type AmbientLight = 'day' | 'dusk' | 'night' | 'torch' | 'underworld';

/** Entity spawn request: the hero. */
export interface HeroEntitySpec {
  readonly kind: 'hero';
  /** World-space spawn (feet anchor, px). */
  readonly x: number;
  readonly y: number;
  readonly facing?: FacingDir;
}

/** Sprite/animation wiring for a marker entity (atlas ids, not data). */
export interface MarkerSpriteSpec {
  readonly atlasId: string;
  /** Looping animation key in the atlas manifest, e.g. `marker_shrine`. */
  readonly animationKey: string;
  /** Initial frame name (frame 0 of the animation). */
  readonly frameId: string;
}

/** Entity spawn request: a walk-over marker (P2.E2.T4). */
export interface MarkerEntitySpec {
  readonly kind: 'marker';
  readonly markerId: string;
  readonly markerKind: MarkerKind;
  /** Feet-anchor spawn (px): tile center-x, tile bottom-y. */
  readonly x: number;
  readonly y: number;
  /** Where "enter" goes (level id / boss id / `hub` / `overworld`). */
  readonly target: string;
  /** i18n key for the marker's display name. */
  readonly labelKey: string;
  /** Proximity radius (px) — defaults to the configured interact radius. */
  readonly radiusPx?: number;
  readonly sprite: MarkerSpriteSpec;
}

/** Anything a scene can spawn. */
export type EntitySpec = HeroEntitySpec | MarkerEntitySpec;

/**
 * Plain-data scene description (spec 07 §5 `SceneSpec`).
 */
export interface SceneSpec {
  readonly type: SceneType;
  /** Stable scene id, e.g. `act1_overworld`. */
  readonly id: string;
  /** Map asset id — the builder resolves it (spec 07 §7: ids, not data). */
  readonly tilemap?: string;
  readonly entities: readonly EntitySpec[];
  /** Music track id (resolved by the audio bridge). */
  readonly music: string;
  /** Ambience bed id, when the scene has one. */
  readonly ambience?: string;
  readonly ambientLight?: AmbientLight;
  /** Player spawn in world px (feet anchor). */
  readonly playerSpawn: { x: number; y: number };
}

/** A live scene: everything the loop + screens need. */
export interface SceneHandle {
  /** The simulation world the GameLoop drives. */
  readonly gameWorld: GameWorld;
  /** Scene camera (already zoomed + snapped to the spawn). */
  readonly camera: Camera;
  /** Entity ids spawned from `SceneSpec.entities`, keyed by spec index. */
  readonly entityIds: readonly number[];
  /**
   * Parsed map of the scene. Typed loosely here (the engine does not
   * depend on the Tiled parser) — the field builder always supplies a
   * `TileMap`, tests may narrow.
   */
  readonly map: SceneMapLike;
  /** Merged animation registry (gameplay transitions / introspection). */
  readonly animations: SceneAnimationsLike;
}

/**
 * Structural subset of `TileMap` the engine layer may rely on without
 * importing the parser (keeps scene types dependency-light).
 */
export interface SceneMapLike {
  readonly getPixelWidth: () => number;
  readonly getPixelHeight: () => number;
}

/** Structural subset of `AnimationTable`. */
export interface SceneAnimationsLike {
  readonly has: (key: string) => boolean;
}

/**
 * Turns a spec into a live scene. Implementations MUST return a handle
 * whose camera is already zoomed and snapped to `spec.playerSpawn`
 * (loadScene step 4 "reset camera" — snapping is a build concern
 * because only the builder knows the map bounds it clamps against).
 */
export type SceneBuilder = (spec: SceneSpec) => SceneHandle;

/**
 * Applies a spec's audio on scene enter / tears it down on exit
 * (spec 07 §5 step 6: cross-fade to `spec.music`). The engine never
 * touches the platform audio layer directly.
 */
export interface SceneAudioBridge {
  /** Cross-fade to the scene's music; swap the ambience bed. */
  enter(music: string, ambience?: string): void;
  /** Scene gone — fade any ambience out (music keeps floating per spec 11). */
  exit(): void;
}
