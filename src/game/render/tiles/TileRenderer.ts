/**
 * TileRenderer — Skia tile blitter with run merging + culling
 * (spec 07 §3.4).
 *
 * Walks a {@link TileMap} layer and emits `drawImageRect` calls against
 * a Skia canvas. Optimizations (spec 07 §3.4 "merge horizontal runs of
 * same tileId into one ImageRect"):
 *
 *  - **Culling**: tiles outside the camera viewport are skipped before
 *    any batching work happens.
 *  - **Run merging**: horizontally adjacent, visually identical tiles
 *    (same source rect + same flip state) are merged into a single
 *    `drawImageRect` whose destination is the full run. Stretching one
 *    tile across a run of N identical tiles is pixel-identical to N
 *    separate draws, so a dense map collapses to ~(visible rows × runs)
 *    draw calls instead of one per tile.
 *  - **Zero per-frame allocations**: no intermediate Maps or string keys —
 *    a single pass appends merged ops to the output array.
 *
 * All destination rects are in WORLD space; the camera transform
 * (translate + scale) is applied once on the canvas, so draw calls stay
 * zoom-agnostic. Drawing in pre-transformed screen coords here would
 * double-apply the zoom (canvas.scale × pre-multiplied dest).
 *
 * Tiled flip flags are honored: horizontal/vertical flips are applied
 * via canvas scale transforms (and merge fine, since a mirrored strip of
 * identical tiles equals a strip of mirrored tiles). Diagonal flips are
 * drawn individually via a 90° rotation (transposition does not merge).
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
  /** Rotate the current matrix by `radians` (only needed for diag flips). */
  rotate?(radians: number): void;
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
  /** Source rect in the tileset image (a single tile's rect). */
  src: SkiaRect;
  /**
   * Destination rect in WORLD space (the camera transform is applied on
   * the canvas, NOT baked into this rect). Width/height may span a whole
   * merged run of identical tiles.
   */
  dest: SkiaRect;
  /** Tile ID of the first tile in the run (for debugging / tests). */
  tileId: number;
  /** Number of tiles merged into this op (1 = unmerged). */
  tileCount: number;
  /** Tiled flip flags (all tiles in a run share them). */
  flipX: boolean;
  flipY: boolean;
  flipDiag: boolean;
}

/**
 * Tile renderer: culls + batch-merges tiles per layer.
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
   *  1. Save the canvas, apply the camera transform (translate + scale).
   *  2. Compute the visible world-space bounds (for culling).
   *  3. Walk the layer's tiles, skipping off-screen ones.
   *  4. Merge horizontal runs of visually identical tiles.
   *  5. Emit one `drawImageRect` per merged run (world-space dest).
   *  6. Restore the canvas.
   *
   * @returns the number of `drawImageRect` calls actually emitted
   *          (post-culling, post-merging).
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
   * Compute the visible, run-merged ops for a layer WITHOUT drawing
   * them. Useful for tests and for pre-batching multiple layers before
   * flushing.
   *
   * Single pass, no intermediate Map/string keys: each tile either
   * extends the current run or flushes it.
   */
  computeBatch(layer: Layer): TileDrawOp[] {
    const bounds = this.camera.getVisibleBounds();
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.width;
    const maxY = bounds.y + bounds.height;

    const ops: TileDrawOp[] = [];
    let run: TileDrawOp | null = null;

    for (const tile of layer.tiles) {
      // Cull: skip tiles entirely outside the visible world bounds
      // (strict inequalities — zero-pixel overlap is culled).
      if (
        tile.x + tile.srcWidth <= minX ||
        tile.x >= maxX ||
        tile.y + tile.srcHeight <= minY ||
        tile.y >= maxY
      ) {
        continue;
      }

      // Diagonal flips transpose the tile — they cannot merge into
      // horizontal runs; each is emitted individually.
      if (
        run !== null &&
        !tile.flipDiag &&
        !run.flipDiag &&
        run.src.x === tile.srcX &&
        run.src.y === tile.srcY &&
        run.src.width === tile.srcWidth &&
        run.src.height === tile.srcHeight &&
        run.dest.y === tile.y &&
        run.dest.height === tile.srcHeight &&
        run.flipX === tile.flipX &&
        run.flipY === tile.flipY &&
        run.dest.x + run.dest.width === tile.x
      ) {
        // Extend the run: same single-tile src, wider dest.
        run.dest.width += tile.srcWidth;
        run.tileCount += 1;
      } else {
        if (run !== null) {
          ops.push(run);
        }
        run = {
          src: {
            x: tile.srcX,
            y: tile.srcY,
            width: tile.srcWidth,
            height: tile.srcHeight,
          },
          dest: {
            x: tile.x,
            y: tile.y,
            width: tile.srcWidth,
            height: tile.srcHeight,
          },
          tileId: tile.tileId,
          tileCount: 1,
          flipX: tile.flipX,
          flipY: tile.flipY,
          flipDiag: tile.flipDiag,
        };
      }
    }
    if (run !== null) {
      ops.push(run);
    }

    return ops;
  }

  /**
   * Internal: actually draw a layer's tiles to the canvas.
   */
  private drawLayerTiles(layer: Layer): number {
    if (!layer.visible) return 0;

    this.lastBatch = [];

    // Apply camera transform: translate first, then scale. Skia
    // post-multiplies, so a world point maps to screen as
    //   screen = (world * scale) + translate = (world - camera) * zoom.
    // Draw calls below use WORLD-space dests — the canvas transform
    // applies the zoom exactly once.
    this.canvas.save();
    const t = this.camera.getTransform();
    this.canvas.translate(t.translateX, t.translateY);
    this.canvas.scale(t.scale, t.scale);

    // Clip to the viewport (expressed in world coordinates — we are
    // inside the camera transform) so fill rate isn't wasted off-screen.
    if (this.canvas.clipRect) {
      const v = this.camera.viewport;
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
      this.drawOp(op);
    }

    this.canvas.restore();
    this.lastBatch = ops;
    return ops.length;
  }

  /**
   * Emit one draw call for a merged op, applying any Tiled flip via a
   * canvas transform around the draw. Merged runs share flip state, so
   * a single transform covers the whole run.
   */
  private drawOp(op: TileDrawOp): void {
    const { dest, src } = op;

    if (!op.flipX && !op.flipY && !op.flipDiag) {
      this.canvas.drawImageRect(this.tilesetImage, src, dest, this.paint ?? null, false);
      return;
    }

    this.canvas.save();
    try {
      if (op.flipDiag) {
        // Diagonal flip = transposition: dest(x, y) = src(y, x).
        // Compose rotate(90°) then mirror-x (rotation applies first).
        // Requires square tiles (Tiled's own assumption for diag flips).
        if (!this.canvas.rotate) {
          // Canvas can't rotate — fall back to drawing unflipped rather
          // than skipping the tile entirely.
          this.canvas.drawImageRect(this.tilesetImage, src, dest, this.paint ?? null, false);
          return;
        }
        this.canvas.translate(dest.x, dest.y);
        this.canvas.scale(-1, 1);
        this.canvas.rotate(Math.PI / 2);
        this.canvas.drawImageRect(
          this.tilesetImage,
          src,
          { x: 0, y: 0, width: dest.height, height: dest.width },
          this.paint ?? null,
          false,
        );
        return;
      }

      // Mirror flips: translate to the appropriate corner so the scale(-1)
      // pivots inside the (possibly multi-tile) run rect.
      const pivotX = op.flipX ? dest.x + dest.width : dest.x;
      const pivotY = op.flipY ? dest.y + dest.height : dest.y;
      this.canvas.translate(pivotX, pivotY);
      this.canvas.scale(op.flipX ? -1 : 1, op.flipY ? -1 : 1);
      this.canvas.drawImageRect(
        this.tilesetImage,
        src,
        { x: 0, y: 0, width: dest.width, height: dest.height },
        this.paint ?? null,
        false,
      );
    } finally {
      this.canvas.restore();
    }
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
  return {
    src,
    dest,
    tileId: tile.tileId,
    tileCount: 1,
    flipX: tile.flipX,
    flipY: tile.flipY,
    flipDiag: tile.flipDiag,
  };
}
