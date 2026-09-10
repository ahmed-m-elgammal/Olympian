/**
 * Shared pixel-grid toolkit for the generated tile art.
 *
 * Tiles are authored as 16-row ASCII grids ("." = transparent, any other
 * char = a legend color). This module owns the grid size, the paint
 * helpers, the deterministic PRNG, and the grid → RGBA raster step, so
 * every tile module (demo glade, Act 1 overworld) shares one
 * implementation instead of drifting copies.
 *
 * Determinism matters: bakes must be byte-identical across runs/CI, so
 * all randomness flows through the seeded {@link mulberry32} PRNG.
 *
 * @packageDocumentation
 */

import { buildLegend, type Rgba } from './palette';
import type { Raster } from './png';

/** Edge length of one tile in px (spec 01 §7.1 world scale). */
export const TILE_SIZE = 16;

/** Legend type: character → palette id (see `buildLegend`). */
export type TileLegend = Readonly<Record<string, string>>;

/** Blank transparent tile grid. */
export function blankTile(): string[] {
  return Array.from({ length: TILE_SIZE }, () => '.'.repeat(TILE_SIZE));
}

/** Paint a single pixel (silently clamped to the grid). */
export function setPx(dst: string[], x: number, y: number, ch: string): void {
  if (y < 0 || y >= TILE_SIZE || x < 0 || x >= TILE_SIZE) return;
  const row = dst[y].split('');
  row[x] = ch;
  dst[y] = row.join('');
}

/** Fill the whole grid with one character. */
export function fill(dst: string[], ch: string): void {
  for (let y = 0; y < TILE_SIZE; y++) {
    dst[y] = ch.repeat(TILE_SIZE);
  }
}

/**
 * Scatter `count` pixels of `ch` at pseudo-random positions, optionally
 * avoiding given cells. Guarded so it always terminates.
 */
export function scatter(
  dst: string[],
  rand: () => number,
  ch: string,
  count: number,
  avoid: ReadonlyArray<{ x: number; y: number }> = [],
): void {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    const x = Math.floor(rand() * TILE_SIZE);
    const y = Math.floor(rand() * TILE_SIZE);
    if (avoid.some((p) => p.x === x && p.y === y)) continue;
    setPx(dst, x, y, ch);
    placed++;
  }
}

/**
 * mulberry32 — tiny deterministic PRNG. Seed it per-feature so
 * reordering painters never changes unrelated tiles.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert an ASCII grid to an RGBA raster via a legend. Throws loudly
 * when a row is missing or short — a malformed grid must never reach
 * the atlas.
 */
export function rasterFromGrid(
  rows: readonly string[],
  legend: TileLegend,
  size: number = TILE_SIZE,
): Raster {
  if (rows.length !== size) {
    throw new Error(`pixelGrid: expected ${size} rows, got ${rows.length}`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== size) {
      throw new Error(`pixelGrid: row ${i} is ${rows[i].length} chars: "${rows[i]}"`);
    }
  }
  const resolve = buildLegend(legend);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === undefined) continue;
      const rgba: Rgba = resolve(ch);
      if (rgba[3] === 0) continue;
      const i = (y * size + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  return { width: size, height: size, data };
}
