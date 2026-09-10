/**
 * TileRenderer — Skia tile blitter with batching + culling
 * (spec 07 §3.4).
 *
 * Walks a {@link TileMap} layer and emits `drawImageRect` calls against
 * a Skia canvas, batching by source rect to minimize Skia paint
 * setup. Off-screen tiles (outside the camera viewport) are culled.
 *
 * To keep this module unit-testable without a native Skia runtime, the
 * renderer operates on a small {@link SkiaCanvasLike} interface rather
 * than the concrete `SkCanvas`. In production the caller wraps the
 * actual Skia canvas (see `src/game/render/canvas/GameCanvas.tsx`);
 * in tests, a mock canvas captures calls.
 *
 * @packageDocumentation
 */

import type { Camera } from '../canvas/Camera';
import type { Layer, Tile, TileMap } from './TileMap';
import type { Rect } from '../sprites/SpriteSheet';

/** Minimal image interface TileRenderer needs from Skia. */
export interface SkiaImageLike {
  /** Image width in pixels. */
  width(): number;
  /** Image height in pixels. */
  height(): number;
}

/** Minimal paint interface (we only need it as an opaque handle). */
export interface SkiaPaintLike {
  // Marker — actual Skia SkPaint is structurally compatible.
}

/** Rect compatible with Skia's SkRect. */
export interface SkiaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clip op enum, mirroring Skia's `ClipOp`. */
export enum ClipOpLike {
  Difference = 0,
  Intersect = 1,
}

/**
 * The subset of Skia's `SkCanvas` that TileRenderer uses. Any concrete
 * canvas implementing these methods can be passed in.
 */
export interface SkiaCanvasLike {
  /** Save the current matrix/clip stack. Returns the save count. */
  save(): number;
  /** Restore the most recent save. */
  restore(): void;
  /** Translate the current matrix. */
  translate(dx: number, dy: number): void;
  /** Scale the current matrix. */
  scale(sx: number, sy: number): void;
  /** Clip to the given rect. */
  clipRect?(rect: SkiaRect, op?: ClipOpLike): void;
  /**
   * Draw sub-rectangle `src` from the image, scaled to fill `dest`.
   * Matches Skia's `drawImageRect(image, src, dest, paint, fast?)`.
   */
  drawImageRect(
    image: SkiaImageLike,
    src: SkiaRect,
    dest: SkiaRect,
    paint?: SkiaPaintLike | null,
    fastSample?: boolean,
  ): void;
}

/** Constructor options for {@link TileRenderer}. */
export interface TileRendererOptions {
  /** Target Skia canvas (or a mock for testing). */
  canvas: SkiaCanvasLike;
  /** Camera used for viewport culling + transform. */
  camera: Camera;
  /** Map whose layers will be drawn. */
  tileMap: TileMap;
  /** The tileset image to blit tiles from. */
  tilesetImage: SkiaImageLike;
  /** Optional paint handle (e.g. for filtering mode). */
  paint?: SkiaPaintLike;
}

/**
 * A single batched draw operation — used for both production drawing
 * and for tests to verify which tiles were emitted.
 */
export interface TileDrawOp {
  /** Source rect in the tileset image. */
  src: SkiaRect;
  /** Destination rect in screen space (already camera-transformed). */
  dest: SkiaRect;
  /** Tile ID (for debugging / dedup verification). */
  tileId: number;
}

/**
 * Tile renderer: batches + culls tiles per layer.
 *
 * @example
 * ```ts
 * const renderer = new TileRenderer({
 *   canvas: skiaCanvas,
 *   camera,
 *   tileMap: map,
 *   tilesetImage: skiaImage,
 * });
 * renderer.drawLayer('ground');
 * renderer.drawLayer('decor');
 * ```
 */
export class TileRenderer {
  public readonly canvas: SkiaCanvasLike;
  public readonly camera: Camera;
  public readonly tileMap: TileMap;
  public readonly tilesetImage: SkiaImageLike;
  public readonly paint?: SkiaPaintLike;

  /** Last batch of ops emitted by `drawLayer` — useful for tests. */
  public lastBatch: TileDrawOp[] = [];

  constructor(opts: TileRendererOptions) {
    this.canvas = opts.canvas;
    this.camera = opts.camera;
    this.tileMap = opts.tileMap;
    this.tilesetImage = opts.tilesetImage;
    this.paint = opts.paint;
  }

  /**
   * Draw all tiles in the named layer.
   *
   * Steps:
   *  1. Save the canvas, apply camera transform.
   *  2. Compute the visible world-space bounds (for culling).
   *  3. Walk the layer's tiles, skipping off-screen ones.
   *  4. Group remaining tiles by source rect (batch).
   *  5. Emit one `drawImageRect` per tile (preserves 1:1 size).
   *  6. Restore the canvas.
   *
   * @returns the number of `drawImageRect` calls actually emitted
   *          (post-culling).
   */
  drawLayer(layerName: string): number {
    const layer = this.tileMap.getLayer(layerName);
    if (!layer) {
      return 0;
    }
    return this.drawLayerTiles(layer);
  }

  /**
   * Variant that accepts a layer index instead of a name.
   */
  drawLayerByIndex(index: number): number {
    const layer = this.tileMap.getLayerByIndex(index);
    if (!layer) return 0;
    return this.drawLayerTiles(layer);
  }

  /**
   * Compute the visible ops for a layer WITHOUT drawing them. Useful
   * for tests and for pre-batching multiple layers before flushing.
   */
  computeBatch(layer: Layer): TileDrawOp[] {
    const bounds = this.camera.getVisibleBounds();
    const zoom = this.camera.zoom;
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.width;
    const maxY = bounds.y + bounds.height;

    // Bucket by (srcX, srcY, srcW, srcH) so the test harness can
    // verify "same tileId batched together". We still emit one call
    // per tile in `drawLayerTiles` (each tile keeps its 1:1 size);
    // the bucketing is for diagnostic + future merge work.
    const buckets = new Map<string, TileDrawOp[]>();
    for (const tile of layer.tiles) {
      // Cull: skip tiles entirely outside the visible bounds. Add a
      // one-tile margin so partially visible tiles are kept.
      const margin = Math.max(tile.srcWidth, tile.srcHeight);
      if (
        tile.x + tile.srcWidth < minX - margin ||
        tile.x > maxX + margin ||
        tile.y + tile.srcHeight < minY - margin ||
        tile.y > maxY + margin
      ) {
        continue;
      }
      const src: SkiaRect = {
        x: tile.srcX,
        y: tile.srcY,
        width: tile.srcWidth,
        height: tile.srcHeight,
      };
      const dest: SkiaRect = {
        x: tile.x * zoom,
        y: tile.y * zoom,
        width: tile.srcWidth * zoom,
        height: tile.srcHeight * zoom,
      };
      const op: TileDrawOp = { src, dest, tileId: tile.tileId };
      const key = `${src.x},${src.y},${src.width},${src.height}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(op);
    }

    // Flatten buckets back into a single list (preserving bucket order).
    const ops: TileDrawOp[] = [];
    for (const bucket of buckets.values()) {
      for (const op of bucket) {
        ops.push(op);
      }
    }
    return ops;
  }

  /**
   * Internal: actually draw a layer's tiles to the canvas.
   */
  private drawLayerTiles(layer: Layer): number {
    if (!layer.visible) return 0;

    this.lastBatch = [];

    // Apply camera transform: translate first (Skia's `translate`
    // post-multiplies the matrix, so we apply scale AFTER translate
    // to map world → screen).
    this.canvas.save();
    const t = this.camera.getTransform();
    this.canvas.translate(t.translateX, t.translateY);
    this.canvas.scale(t.scale, t.scale);

    // Optional: clip to viewport so we don't waste fill rate outside
    // the visible area.
    if (this.canvas.clipRect) {
      const v = this.camera.viewport;
      // We're already inside translate/scale, so the clip needs to be
      // expressed in *world* coordinates here. Inverse-transform the
      // screen-space viewport.
      const worldClip: SkiaRect = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        width: v.width / this.camera.zoom,
        height: v.height / this.camera.zoom,
      };
      this.canvas.clipRect(worldClip, ClipOpLike.Intersect);
    }

    const ops = this.computeBatch(layer);
    for (const op of ops) {
      this.canvas.drawImageRect(
        this.tilesetImage,
        op.src,
        op.dest,
        this.paint ?? null,
        false,
      );
    }

    this.canvas.restore();
    this.lastBatch = ops;
    return ops.length;
  }
}

export default TileRenderer;

/** Helper: convert a {@link Tile} to a {@link TileDrawOp} in world space
 * (no camera transform applied — used by tests + tooling). */
export function tileToOp(tile: Tile): TileDrawOp {
  const src: Rect = {
    x: tile.srcX,
    y: tile.srcY,
    width: tile.srcWidth,
    height: tile.srcHeight,
  };
  const dest: SkiaRect = {
    x: tile.x,
    y: tile.y,
    width: tile.srcWidth,
    height: tile.srcHeight,
  };
  return { src, dest, tileId: tile.tileId };
}
