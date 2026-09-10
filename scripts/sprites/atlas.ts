/**
 * Shared atlas packing for the generated sprite sheets (spec 12 §4.4).
 *
 * Frames are packed row-major into a square atlas with no padding —
 * the runtime samples exact source rects with nearest-neighbour
 * filtering (`fit: 'none'` + `sampling`), so padding is unnecessary
 * and would only waste texture space.
 */

import type { Raster } from './png';

/** A named frame with its pixel content. */
export interface ArtFrame {
  /** Unique frame name, e.g. `hero_walk_left_3`. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** RGBA raster of just this frame. */
  readonly raster: Raster;
}

/** Frame rect inside the packed atlas (matches the runtime manifest). */
export interface PackedFrame {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Result of packing frames into one atlas. */
export interface PackedAtlas {
  readonly atlasSize: number;
  readonly frames: readonly PackedFrame[];
  readonly raster: Raster;
}

/**
 * Pack frames row-major into the smallest power-of-two atlas (capped at
 * 1024, per spec 12 §1) that fits every frame.
 */
export function packAtlas(artFrames: readonly ArtFrame[]): PackedAtlas {
  if (artFrames.length === 0) {
    throw new Error('packAtlas: no frames');
  }
  for (const size of [256, 512, 1024]) {
    const packed = tryPack(artFrames, size);
    if (packed) {
      return { atlasSize: size, frames: packed, raster: compose(artFrames, packed, size) };
    }
  }
  throw new Error('packAtlas: frames do not fit in a 1024×1024 atlas');
}

/** Try to lay frames out in a grid of the given atlas size. */
function tryPack(
  artFrames: readonly ArtFrame[],
  size: number,
): readonly PackedFrame[] | null {
  const frames: PackedFrame[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const f of artFrames) {
    if (f.width > size || f.height > size) return null;
    if (x + f.width > size) {
      // Wrap to the next row.
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    if (y + f.height > size) return null;
    frames.push({ name: f.name, x, y, width: f.width, height: f.height });
    x += f.width;
    rowHeight = Math.max(rowHeight, f.height);
  }
  return frames;
}

/** Compose the packed frames into a single transparent RGBA raster. */
function compose(
  artFrames: readonly ArtFrame[],
  packed: readonly PackedFrame[],
  size: number,
): Raster {
  const data = new Uint8Array(size * size * 4);
  const byName = new Map(artFrames.map((f) => [f.name, f] as const));
  for (const rect of packed) {
    const f = byName.get(rect.name);
    if (!f) throw new Error(`packAtlas: missing frame "${rect.name}"`);
    for (let y = 0; y < f.height; y++) {
      const srcStart = (y * f.width) * 4;
      const dstStart = ((rect.y + y) * size + rect.x) * 4;
      data.set(
        f.raster.data.subarray(srcStart, srcStart + f.width * 4),
        dstStart,
      );
    }
  }
  return { width: size, height: size, data };
}
