/**
 * DrawCommand — flat draw list command (spec 07 §3.2).
 *
 * Each frame, the {@link RenderSystem} collects a flat list of these
 * commands, sorts them by `zIndex`, and emits them to the Skia
 * renderer. Commands are plain data records — no behavior — so the
 * list can be serialized, snapshot-tested, and diffed cheaply.
 *
 * @packageDocumentation
 */

/** Discriminator for {@link DrawCommand}. Matches spec 07 §3.2. */
export type DrawCommandType =
  | 'sprite'
  | 'tile'
  | 'rect'
  | 'circle'
  | 'text'
  | 'particle'
  | 'shake';

/**
 * A single draw operation emitted by the {@link RenderSystem}.
 *
 * Fields are union-friendly: only `type`-relevant fields need to be
 * set (e.g. a `'rect'` command only fills `color` and the rect
 * fields; `sprite` and `text` are ignored by the renderer).
 *
 * Spec 07 §3.2 defines the command surface as
 * `sprite | tile | rect | text | particle | shake`; `circle` is a
 * local addition used by the particle renderer.
 */
export interface DrawCommand {
  /** Discriminator. */
  type: DrawCommandType;
  /** X position (world or screen space, depending on caller). */
  x: number;
  /** Y position. */
  y: number;
  /** Width (px). For circles, treated as diameter. */
  width: number;
  /** Height (px). For circles, treated as diameter. */
  height: number;
  /** CSS color string (hex or `rgba(...)`). Required for `rect`,
   * `circle`, `text`. Optional for `sprite` (used as tint). */
  color?: string;
  /** Sprite ID (atlas-relative). Required for `sprite`. */
  sprite?: string;
  /** Atlas ID owning the sprite. Required for `sprite`. */
  atlas?: string;
  /** Text content. Required for `text`. */
  text?: string;
  /** Font size (px). Optional for `text`. */
  size?: number;
  /** Z-order — lower values draw first (back). The spec calls this
   * `layer`; renamed here to avoid confusion with tile layers. */
  zIndex: number;
  /** Whether to flip the sprite horizontally. Optional for `sprite`. */
  flipX?: boolean;
  /** Whether to flip vertically (tiled mirroring). Optional for `tile`. */
  flipY?: boolean;
  /** Opacity 0..1. Optional for all types. */
  alpha?: number;
  /** Tileset/global tile id. Required for `tile`. */
  tileId?: number;
  /** Particle id (atlas-relative). Required for `particle`. */
  particleId?: string;
  /** Age of the particle in ms (drives fade/scale). Optional for
   * `particle`. */
  ageMs?: number;
  /** Shake magnitude in px. Required for `shake`. */
  intensity?: number;
  /** Remaining shake duration in ms. Required for `shake`. */
  durationMs?: number;
}

/** Factory helpers for common command shapes. */
export const DrawCommandFactories = {
  /** Build a sprite command. */
  sprite(
    atlas: string,
    sprite: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number,
    opts: Partial<Pick<DrawCommand, 'flipX' | 'alpha' | 'color'>> = {},
  ): DrawCommand {
    return {
      type: 'sprite',
      atlas,
      sprite,
      x,
      y,
      width,
      height,
      zIndex,
      ...opts,
    };
  },

  /** Build a filled-rect command. */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    zIndex: number,
  ): DrawCommand {
    return { type: 'rect', x, y, width, height, color, zIndex };
  },

  /** Build a filled-circle command. */
  circle(
    cx: number,
    cy: number,
    diameter: number,
    color: string,
    zIndex: number,
  ): DrawCommand {
    return {
      type: 'circle',
      x: cx,
      y: cy,
      width: diameter,
      height: diameter,
      color,
      zIndex,
    };
  },

  /** Build a text command. */
  text(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    zIndex: number,
  ): DrawCommand {
    return {
      type: 'text',
      text,
      x,
      y,
      width: 0,
      height: 0,
      size,
      color,
      zIndex,
    };
  },

  /** Build a tile command (spec 07 §3.2). */
  tile(
    tileId: number,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number,
  ): DrawCommand {
    return { type: 'tile', tileId, x, y, width, height, zIndex };
  },

  /** Build a particle command (spec 07 §3.2). */
  particle(
    particleId: string,
    x: number,
    y: number,
    size: number,
    ageMs: number,
    zIndex: number,
    color?: string,
  ): DrawCommand {
    return {
      type: 'particle',
      particleId,
      x,
      y,
      width: size,
      height: size,
      ageMs,
      zIndex,
      color,
    };
  },

  /** Build a screen-shake command (spec 07 §3.2). */
  shake(intensity: number, durationMs: number, zIndex: number): DrawCommand {
    return {
      type: 'shake',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      intensity,
      durationMs,
      zIndex,
    };
  },
};

export default DrawCommand;
