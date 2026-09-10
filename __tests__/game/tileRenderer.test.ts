/**
 * Tests for TileRenderer — run merging, culling, world-space dests, and
 * Tiled flip handling (spec 07 §3.4, task P1.E2.T6).
 *
 * Regressions covered:
 *  - Double-zoom: dest rects must be in WORLD space; the camera zoom is
 *    applied once via the canvas transform, never baked into dests.
 *  - Run merging: horizontally adjacent identical tiles collapse into a
 *    single draw call.
 *  - Flip rendering: flipX/flipY via canvas scale pivots, diag via rotate.
 */

import { Camera } from '@/game/render/canvas/Camera';
import { TileMap, type TileMapData } from '@/game/render/tiles/TileMap';
import {
  TileRenderer,
  type SkiaCanvasLike,
  type SkiaRect,
} from '@/game/render/tiles/TileRenderer';

/** Mock canvas capturing every op for assertions. */
class MockCanvas implements SkiaCanvasLike {
  readonly ops: Array<
    | { kind: 'save' }
    | { kind: 'restore' }
    | { kind: 'translate'; dx: number; dy: number }
    | { kind: 'scale'; sx: number; sy: number }
    | { kind: 'rotate'; radians: number }
    | { kind: 'clip'; rect: SkiaRect }
    | {
        kind: 'drawImageRect';
        src: SkiaRect;
        dest: SkiaRect;
      }
  > = [];

  save(): number {
    this.ops.push({ kind: 'save' });
    return this.ops.length;
  }
  restore(): void {
    this.ops.push({ kind: 'restore' });
  }
  translate(dx: number, dy: number): void {
    this.ops.push({ kind: 'translate', dx, dy });
  }
  scale(sx: number, sy: number): void {
    this.ops.push({ kind: 'scale', sx, sy });
  }
  rotate(radians: number): void {
    this.ops.push({ kind: 'rotate', radians });
  }
  clipRect(rect: SkiaRect): void {
    this.ops.push({ kind: 'clip', rect });
  }
  drawImageRect(_image: unknown, src: SkiaRect, dest: SkiaRect): void {
    this.ops.push({ kind: 'drawImageRect', src, dest });
  }

  draws(): Array<{ src: SkiaRect; dest: SkiaRect }> {
    return this.ops
      .filter((o): o is Extract<typeof o, { kind: 'drawImageRect' }> => o.kind === 'drawImageRect')
      .map((o) => ({ src: o.src, dest: o.dest }));
  }
}

const image = { width: () => 64, height: () => 16 };

function makeMapData(): TileMapData {
  return {
    width: 6,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      { firstgid: 1, tilewidth: 16, tileheight: 16, imagewidth: 64, imageheight: 16 },
    ],
    layers: [
      {
        name: 'ground',
        // Row 0: three 1s, gap, two 2s. Row 1: all 1s.
        data: [
          1, 1, 1, 0, 2, 2,
          1, 1, 1, 1, 1, 1,
        ],
      },
    ],
  };
}

function makeRenderer(
  data: TileMapData,
  canvas: MockCanvas,
  cameraOverrides?: Partial<{ x: number; y: number; zoom: number; viewportW: number; viewportH: number }>,
): { renderer: TileRenderer; camera: Camera } {
  const camera = new Camera();
  camera.setViewport(
    cameraOverrides?.viewportW ?? 96,
    cameraOverrides?.viewportH ?? 32,
  );
  camera.setPosition(cameraOverrides?.x ?? 0, cameraOverrides?.y ?? 0);
  if (cameraOverrides?.zoom !== undefined) {
    camera.setZoom(cameraOverrides.zoom, 0.25, 8);
  }
  const renderer = new TileRenderer({
    canvas,
    camera,
    tileMap: new TileMap(data),
    tilesetImage: image,
  });
  return { renderer, camera };
}

describe('TileRenderer (spec 07 §3.4, P1.E2.T6)', () => {
  it('draws with world-space dest rects (no zoom baked in)', () => {
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(makeMapData(), canvas);
    renderer.drawLayer('ground');

    for (const op of renderer.lastBatch) {
      // Dest rect must equal the tile's world position — NOT
      // pre-multiplied by zoom (the canvas transform handles that).
      expect(op.dest.x % 16).toBe(0);
      expect(op.dest.y % 16).toBe(0);
      expect(op.dest.width % 16).toBe(0);
    }
  });

  it('applies the camera transform exactly once (translate + scale)', () => {
    const canvas = new MockCanvas();
    const { renderer, camera } = makeRenderer(
      makeMapData(),
      canvas,
      { x: 32, y: 8, zoom: 2 },
    );
    renderer.drawLayer('ground');

    const translates = canvas.ops.filter(
      (o): o is Extract<typeof o, { kind: 'translate' }> => o.kind === 'translate',
    );
    const scales = canvas.ops.filter(
      (o): o is Extract<typeof o, { kind: 'scale' }> => o.kind === 'scale',
    );
    // First translate/scale pair is the camera transform.
    expect(translates[0]).toEqual({
      kind: 'translate',
      dx: -camera.position.x * camera.zoom,
      dy: -camera.position.y * camera.zoom,
    });
    expect(scales[0]).toEqual({ kind: 'scale', sx: 2, sy: 2 });
  });

  it('merges horizontal runs of identical tiles into one draw call', () => {
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(makeMapData(), canvas);
    const calls = renderer.drawLayer('ground');

    // Row 0: run of 3× tile1 + single 2s-run of 2 → wait, data row 0 is
    // [1,1,1,0,2,2] → runs: 1×3, 2×2 → 2 ops. Row 1: [1×6] → 1 op. Total 3.
    expect(calls).toBe(3);
    expect(renderer.lastBatch.length).toBe(3);

    const runs = renderer.lastBatch;
    expect(runs[0]).toMatchObject({ tileId: 1, tileCount: 3 });
    expect(runs[0]!.dest).toEqual({ x: 0, y: 0, width: 48, height: 16 });
    // src stays a single tile rect even when the run spans multiple tiles.
    expect(runs[0]!.src).toEqual({ x: 0, y: 0, width: 16, height: 16 });

    expect(runs[1]).toMatchObject({ tileId: 2, tileCount: 2 });
    expect(runs[1]!.dest).toEqual({ x: 64, y: 0, width: 32, height: 16 });
    expect(runs[1]!.src).toEqual({ x: 16, y: 0, width: 16, height: 16 });

    expect(runs[2]).toMatchObject({ tileId: 1, tileCount: 6 });
    expect(runs[2]!.dest).toEqual({ x: 0, y: 16, width: 96, height: 16 });
  });

  it('breaks runs at gaps and differing tiles', () => {
    const data = makeMapData();
    (data.layers[0] as { data: number[] }).data = [1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1];
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(data, canvas);
    renderer.drawLayer('ground');

    // Row 0 alternates → 6 single-tile ops; row 1 merges → 1 op.
    expect(renderer.lastBatch.length).toBe(7);
    expect(renderer.lastBatch.filter((o) => o.tileCount === 1).length).toBe(6);
    expect(renderer.lastBatch[6]).toMatchObject({ tileCount: 6 });
  });

  it('merges flipped runs only with same-flip tiles and applies the flip transform', () => {
    const data = makeMapData();
    // Row 0: two horizontally-flipped tile 1s, then four unflipped tile 1s.
    // Row 1: two vertically-flipped tile 1s, then four unflipped tile 1s.
    (data.layers[0] as { data: number[] }).data = [
      0x80000001, 0x80000001, 1, 1, 1, 1,
      0x40000001, 0x40000001, 1, 1, 1, 1,
    ];
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(data, canvas);
    renderer.drawLayer('ground');

    const runs = renderer.lastBatch;
    // Row 0: flipX run (2) + unflipped run (4) = 2 ops
    // Row 1: flipY run (2) + unflipped run (4) = 2 ops
    expect(runs.length).toBe(4);
    expect(runs[0]).toMatchObject({ flipX: true, flipY: false, tileCount: 2 });
    expect(runs[1]).toMatchObject({ flipX: false, flipY: false, tileCount: 4 });
    expect(runs[2]).toMatchObject({ flipX: false, flipY: true, tileCount: 2 });

    // The flip transforms pivot around the run: a scale(-1,1) op exists
    // for the flipX run and a scale(1,-1) op for the flipY run.
    const scales = canvas.ops.filter(
      (o): o is Extract<typeof o, { kind: 'scale' }> => o.kind === 'scale',
    );
    // scales[0] is the camera transform (1,1); flip pivots follow.
    expect(scales.some((o) => o.sx === -1 && o.sy === 1)).toBe(true);
    expect(scales.some((o) => o.sx === 1 && o.sy === -1)).toBe(true);

    // Flipped draws are issued at the local pivot rect (0,0,w,h).
    const flipXDraw = canvas.draws()[0]!;
    expect(flipXDraw.dest).toEqual({ x: 0, y: 0, width: 32, height: 16 });
    expect(flipXDraw.src).toEqual({ x: 0, y: 0, width: 16, height: 16 });
  });

  it('draws diagonal-flip tiles individually with a rotate transform', () => {
    const data = makeMapData();
    (data.layers[0] as { data: number[] }).data = [
      0x20000001, 0x20000001, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1,
    ];
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(data, canvas);
    renderer.drawLayer('ground');

    const runs = renderer.lastBatch;
    // Two diag tiles (unmerged) + unflipped runs.
    expect(runs.filter((o) => o.flipDiag).length).toBe(2);
    expect(runs.filter((o) => o.flipDiag).every((o) => o.tileCount === 1)).toBe(true);

    // The diag draws are wrapped in save → translate → scale(-1,1) → rotate(π/2).
    const rotates = canvas.ops.filter(
      (o): o is Extract<typeof o, { kind: 'rotate' }> => o.kind === 'rotate',
    );
    expect(rotates.length).toBe(2);
    expect(rotates[0]!.radians).toBeCloseTo(Math.PI / 2);
  });

  it('culls tiles outside the camera viewport', () => {
    const canvas = new MockCanvas();
    // Camera showing only the right half of the 96px-wide map.
    const { renderer } = makeRenderer(makeMapData(), canvas, { x: 48, y: 0 });
    renderer.drawLayer('ground');

    for (const op of renderer.lastBatch) {
      // Everything drawn must intersect the visible world bounds.
      expect(op.dest.x + op.dest.width).toBeGreaterThan(48);
      expect(op.dest.x).toBeLessThan(96);
    }
    // Row 0 tiles at x ≥ 48: the 2s run (x 80..96). Row 1: right 3 tiles
    // (x 48..96). Merged: 1 op for row 0's 2s, 1 op for row 1's right run.
    expect(renderer.lastBatch.length).toBe(2);
  });

  it('skips invisible layers and unknown layers', () => {
    const data = makeMapData();
    (data.layers[0] as { visible?: boolean }).visible = false;
    const canvas = new MockCanvas();
    const { renderer } = makeRenderer(data, canvas);
    expect(renderer.drawLayer('ground')).toBe(0);
    expect(renderer.drawLayer('nope')).toBe(0);
    expect(canvas.draws().length).toBe(0);
  });

  it('keeps merged runs stable when zoom changes (no double-zoom)', () => {
    // Regression: dest used to be pre-multiplied by zoom, so with the
    // canvas ALSO scaled the tiles rendered at zoom².
    const canvas1 = new MockCanvas();
    const { renderer: r1 } = makeRenderer(makeMapData(), canvas1, { zoom: 1 });
    r1.drawLayer('ground');

    const canvas2 = new MockCanvas();
    // Widen the viewport so the visible world bounds at zoom 2 still
    // cover the whole 96×32 map (only the canvas scale should differ).
    const { renderer: r2 } = makeRenderer(makeMapData(), canvas2, {
      zoom: 2,
      viewportW: 192,
      viewportH: 64,
    });
    r2.drawLayer('ground');

    // Same world-space dests regardless of zoom; only the canvas scale differs.
    expect(r1.lastBatch.map((o) => o.dest)).toEqual(r2.lastBatch.map((o) => o.dest));
    const scales = canvas2.ops.filter(
      (o): o is Extract<typeof o, { kind: 'scale' }> => o.kind === 'scale',
    );
    expect(scales[0]).toEqual({ kind: 'scale', sx: 2, sy: 2 });
  });

  it('clips to the viewport in world coordinates', () => {
    const canvas = new MockCanvas();
    const { renderer, camera } = makeRenderer(makeMapData(), canvas, { x: 16, y: 0 });
    renderer.drawLayer('ground');
    const clips = canvas.ops.filter(
      (o): o is Extract<typeof o, { kind: 'clip' }> => o.kind === 'clip',
    );
    expect(clips.length).toBe(1);
    expect(clips[0]!.rect).toEqual({
      x: 16,
      y: 0,
      width: 96 / camera.zoom,
      height: 32 / camera.zoom,
    });
  });
});
