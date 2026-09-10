/**
 * SpriteSheet — atlas + frame lookup (spec 07 §3.3).
 *
 * Holds a reference to a Skia image (the atlas) plus a table mapping
 * frame names to source rectangles inside that atlas. Designed to be
 * engine-agnostic: the heavy lifting of "where is frame X" lives here,
 * while blitting lives in the React/Skia renderer layer.
 *
 * The JSON shape (see {@link SpriteSheetData}) is the output of the
 * asset bake script (spec 12 §6). Frames may be defined by name with
 * explicit pixel rects, or in a uniform grid (`frameWidth` ×
 * `frameHeight`) where each frame is addressed by index.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';

/**
 * A pixel rectangle inside the atlas. Matches Skia's `SkRect` shape
 * (x, y, width, height) so it can be passed straight to `drawImageRect`.
 */
export interface Rect {
  /** Left edge, in atlas pixels. */
  x: number;
  /** Top edge, in atlas pixels. */
  y: number;
  /** Width, in atlas pixels. */
  width: number;
  /** Height, in atlas pixels. */
  height: number;
}

/**
 * One frame definition in the sprite sheet's manifest. The `name` is
 * how the gameplay code looks the frame up (e.g. `lion_idle_0`).
 */
export interface FrameDefinition {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Opaque handle to the underlying atlas image. In production this is
 * a `SkImage` from `@shopify/react-native-skia`; we keep it generic
 * here so this module can be unit-tested without Skia loaded.
 */
export type ImageSource = unknown;

/**
 * Constructor input for {@link SpriteSheet}.
 */
export interface SpriteSheetOptions {
  /** The atlas image handle (e.g. a `SkImage`). */
  atlas: ImageSource;
  /** Named frame rects. */
  frames: FrameDefinition[];
  /** Default frame width — used by `getFrameByIndex` when an entry
   * has no explicit width. */
  frameWidth?: number;
  /** Default frame height — used by `getFrameByIndex` when an entry
   * has no explicit height. */
  frameHeight?: number;
}

/**
 * JSON shape persisted to `assets/sprites/<atlas>.json` by the bake
 * script. Mirrors {@link SpriteSheetOptions} minus the live `atlas`
 * image, which is loaded separately via `useImage(...)`.
 */
export interface SpriteSheetData {
  /** Logical name of the atlas (e.g. `atlas_creatures_01`). */
  atlas?: string;
  /** Width of one frame in pixels. */
  frameWidth?: number;
  /** Height of one frame in pixels. */
  frameHeight?: number;
  /** Total atlas dimensions (optional, for sanity checks). */
  width?: number;
  height?: number;
  /** Frame list. */
  frames: FrameDefinition[];
}

/**
 * Result of a frame lookup — the rect inside the atlas plus the
 * original name. Returned by `getFrame`/`getFrameByIndex`.
 */
export interface FrameLookup extends Rect {
  /** Frame name (matches `FrameDefinition.name`). */
  name: string;
}

/**
 * A sprite sheet: an atlas image + a manifest of named frame rects.
 *
 * Lookups are O(1) via an internal map. Frame rects are NOT mutated
 * after construction — call `dispose` if you need to detach the atlas
 * handle from JS for GC pressure testing.
 */
export class SpriteSheet {
  /** Underlying atlas image handle (e.g. `SkImage`). */
  public readonly atlas: ImageSource;
  /** Default frame width (used when a frame has no explicit width). */
  public readonly frameWidth: number;
  /** Default frame height (used when a frame has no explicit height). */
  public readonly frameHeight: number;

  private readonly framesByName: Map<string, FrameDefinition>;
  private readonly framesByIndex: FrameDefinition[];

  /**
   * Build a sheet from explicit options. Use {@link fromJSON} for the
   * common case of loading a baked JSON manifest.
   */
  constructor(opts: SpriteSheetOptions) {
    this.atlas = opts.atlas;
    this.frameWidth = opts.frameWidth ?? 0;
    this.frameHeight = opts.frameHeight ?? 0;

    // De-duplicate by name (last wins) while preserving declaration order
    // for index-based lookups.
    const seen = new Map<string, FrameDefinition>();
    for (const f of opts.frames) {
      seen.set(f.name, f);
    }
    this.framesByName = seen;
    this.framesByIndex = opts.frames.slice();
  }

  /**
   * Number of declared frames (including duplicates — `getFrameByIndex`
   * walks them in declaration order).
   */
  get frameCount(): number {
    return this.framesByIndex.length;
  }

  /**
   * Look up a frame by name. Throws if the name is unknown — use
   * {@link hasFrame} to probe.
   */
  getFrame(name: string): FrameLookup {
    const f = this.framesByName.get(name);
    if (!f) {
      const msg = `SpriteSheet: unknown frame "${name}"`;
      logger.error(msg);
      throw new Error(msg);
    }
    return { name: f.name, x: f.x, y: f.y, width: f.width, height: f.height };
  }

  /**
   * Look up a frame by index (declaration order). Throws on out-of-range.
   */
  getFrameByIndex(index: number): FrameLookup {
    if (!Number.isInteger(index) || index < 0 || index >= this.framesByIndex.length) {
      const msg = `SpriteSheet: frame index out of range (${index} / ${this.framesByIndex.length})`;
      logger.error(msg);
      throw new Error(msg);
    }
    const f = this.framesByIndex[index]!;
    return { name: f.name, x: f.x, y: f.y, width: f.width, height: f.height };
  }

  /** Test whether a named frame exists. */
  hasFrame(name: string): boolean {
    return this.framesByName.has(name);
  }

  /**
   * Iterate all declared frames (declaration order). Useful for
   * debug overlays and tooling.
   */
  forEachFrame(fn: (frame: FrameDefinition, index: number) => void): void {
    this.framesByIndex.forEach((f, i) => fn(f, i));
  }

  /**
   * Build a SpriteSheet from a JSON manifest (the output of the bake
   * script). Accepts either a parsed object or a JSON string.
   *
   * The atlas image must be supplied separately because it depends on
   * Skia's runtime (`useImage(...)` from React). The factory only
   * parses the manifest portion.
   */
  static fromJSON(
    json: string | SpriteSheetData,
    atlas?: ImageSource,
  ): SpriteSheet {
    const data: SpriteSheetData =
      typeof json === 'string' ? (JSON.parse(json) as SpriteSheetData) : json;
    if (!data || !Array.isArray(data.frames)) {
      throw new Error('SpriteSheet.fromJSON: missing "frames" array');
    }
    return new SpriteSheet({
      atlas: atlas ?? null,
      frames: data.frames,
      frameWidth: data.frameWidth,
      frameHeight: data.frameHeight,
    });
  }
}

export default SpriteSheet;
