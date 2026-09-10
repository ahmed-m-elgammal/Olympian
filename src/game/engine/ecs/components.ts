/**
 * ECS component definitions (spec 07 §1.3).
 *
 * Components are plain data records — no behavior. This module defines
 * the typed catalog: every component has a string key ({@link ComponentTypeKey})
 * and a payload shape ({@link ComponentMap}).
 *
 * P2.E1 implements the subset its systems need (Position / Velocity /
 * MoveIntent / Facing / Locomotion / Collider / Sprite / Animation /
 * PlayerControlled / CameraFollow). The remaining spec 07 §1.3 types
 * (Health, Stats, Combat, AI, PuzzlePiece, Interactable, Lifetime,
 * Persist, Tag, Tile, Bounds) land with their owning epics (P2.E3+)
 * — declaring unused components now would be dead code.
 *
 * Conventions:
 *  - `Position` is the entity's **feet anchor** in world pixels: the
 *    point the renderer draws the sprite above (bottom-center) and the
 *    point the camera targets. Top-down movement math is simplest when
 *    the anchor is where the entity stands.
 *  - Angles are never stored; direction is a `Facing` value object.
 *
 * @packageDocumentation
 */

/** The 4-way facing used by top-down movement and animation keys. */
export type FacingDir = 'down' | 'up' | 'left' | 'right';

// ---------------------------------------------------------------------------
// Spatial
// ---------------------------------------------------------------------------

/** World-space position in pixels (feet anchor — see module docs). */
export interface Position {
  x: number;
  y: number;
}

/** Velocity in px/second. */
export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Desired movement direction for this tick, written by the
 * `InputSystem` from the input store and consumed by the
 * `MovementSystem`. Components are the only way systems exchange data.
 *
 * The vector is analog (joystick): magnitude 0..1, `(0,0)` = idle.
 */
export interface MoveIntent {
  x: number;
  y: number;
}

/** Which way the entity is facing (drives idle/walk animation keys). */
export interface Facing {
  dir: FacingDir;
}

/**
 * Locomotion tuning for an entity. `maxSpeed` is px/second at full
 * joystick deflection; the `MovementSystem` scales it by the intent
 * magnitude so analog input walks slower at the edges.
 *
 * `animationBase` names the entity's animation family in the atlas
 * manifest. The MovementSystem composes keys as
 * `<animationBase>_(walk|idle)_<dir>` — e.g. base `hero` resolves
 * `hero_walk_left` / `hero_idle_down`. This is the manifest naming
 * contract every walking entity must follow (spec 07 §6.1).
 */
export interface Locomotion {
  maxSpeed: number;
  animationBase: string;
}

// ---------------------------------------------------------------------------
// Physics / collision
// ---------------------------------------------------------------------------

/**
 * Axis-aligned collision box anchored at the entity's feet: the box is
 * centered horizontally on `Position` and extends `height` px **up**
 * from it (so a feet box of 10×8 spans y-8..y). This matches the feet
 * anchor convention and gives top-down games forgiving wall contact.
 */
export interface Collider {
  /** Only `'box'` is supported for movement collision in P2.E1. */
  shape: 'box';
  width: number;
  height: number;
  /** `true` = blocks movement; `false` = sensor (triggers, pickups). */
  isSolid: boolean;
  tag?: 'player' | 'enemy' | 'trap' | 'puzzle_piece' | 'goal';
}

// ---------------------------------------------------------------------------
// Visual
// ---------------------------------------------------------------------------

/** Sprite draw reference — the renderer resolves `spriteId` via the atlas manifest. */
export interface Sprite {
  /** Atlas id, e.g. `atlas_hero` (see `atlasRegistry`). */
  atlasId: string;
  /** Frame name inside the atlas manifest, e.g. `hero_idle_down_0`. */
  spriteId: string;
  /** Z-order within the scene (see `@/game/config` layers). */
  layer: number;
  flipX: boolean;
  /** 0..1 */
  alpha: number;
}

/**
 * Sprite animation state. `current` is an animation key from the atlas
 * manifest's `animations` table (e.g. `hero_walk_left`); the
 * `AnimationSystem` advances `frame` at the manifest's fps and mirrors
 * the resolved fps into {@link Animation.fps} for introspection.
 *
 * `onComplete` follows spec 07 §1.3: `'destroy'` removes the entity
 * when a non-looping animation finishes; `'callback'` fires the
 * completion listener registered on the `AnimationSystem` (queued, not
 * inline). Looping animations never complete.
 *
 * P2.E1 additions beyond the spec shape: `elapsedMs` — the frame
 * timer the `AnimationSystem` integrates. The spec's component has no
 * elapsed-time slot, but the animation clock must live somewhere and
 * the component (not a system-internal map) is the only state home
 * that survives serialization.
 *
 * Transitions MUST go through `AnimationTable.setAnimation` so
 * frame/elapsed/fps reset together.
 */
export interface Animation {
  current: string;
  frame: number;
  fps: number;
  loop: boolean;
  /** Elapsed time in the current animation (ms) — advanced by the AnimationSystem. */
  elapsedMs: number;
  onComplete?: 'destroy' | 'callback';
}

// ---------------------------------------------------------------------------
// Player / camera
// ---------------------------------------------------------------------------

/** Marks the entity driven by the local player's input. */
export interface PlayerControlled {
  playerId: string;
}

/** Marks the entity the `CameraSystem` follows (spec 07 §1.3). */
export interface CameraFollow {
  offsetX: number;
  offsetY: number;
}

// ---------------------------------------------------------------------------
// Interaction (P2.E2.T4 — markers: puzzle / boss / portal)
// ---------------------------------------------------------------------------

/** What kind of content a marker leads to (drives UX + routing). */
export type MarkerKind = 'puzzle' | 'boss' | 'portal';

/**
 * A world marker the player can enter by walking over it and tapping
 * (spec 01 §3.1). Data-only: the `MarkerSystem` measures proximity and
 * reports focus; the screen layer decides what "enter" means.
 */
export interface Marker {
  /** Stable marker id, e.g. `puzzle_1` (matches the map object name). */
  markerId: string;
  kind: MarkerKind;
  /** Where "enter" goes: a level id, a boss id, or `hub` / `overworld`. */
  target: string;
  /** i18n key for the marker's display name (resolved by the UI). */
  labelKey: string;
  /** Proximity radius in world px (center-to-feet). */
  radiusPx: number;
  /** Whether the player currently stands in range (written by `MarkerSystem`). */
  playerInFocus: boolean;
}

// ---------------------------------------------------------------------------
// Typed component registry
// ---------------------------------------------------------------------------

/**
 * Every component key with its payload type. Systems address components
 * through these keys and get full type inference:
 *
 * ```ts
 * const pos = world.getComponent(hero, 'position'); // Position | undefined
 * ```
 */
export interface ComponentMap {
  position: Position;
  velocity: Velocity;
  moveIntent: MoveIntent;
  facing: Facing;
  locomotion: Locomotion;
  collider: Collider;
  sprite: Sprite;
  animation: Animation;
  playerControlled: PlayerControlled;
  cameraFollow: CameraFollow;
  marker: Marker;
}

/** Valid component keys. */
export type ComponentTypeKey = keyof ComponentMap;
