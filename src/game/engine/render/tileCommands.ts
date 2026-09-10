/**
 * Tile draw-command production (spec 07 §3.2 `tile` commands).
 *
 * Wraps the P1.E2 {@link TileRenderer} batching machinery (viewport
 * culling + horizontal run merging, spec 07 §8) and emits the merged
 * batches as plain `tile` DrawCommands so the whole visible world —
 * map AND actors — flows through the render bus in one sorted list.
 *
 * Commands carry the tileset-local tile id; the renderer resolves the
 * src rect through the atlas registry (spec 07 §7: ids, not data).
 * Tiled mirror flips ride along on the command; diagonal flips have no
 * command representation — a merged diagonal run is emitted per-tile
 * and drawn unflipped by the renderer (same fallback the imperative
 * TileRenderer uses for rotation-less canvases). The demo map contains
 * no flipped tiles; authored Tiled maps (P2.E2) are the first consumer.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type { Camera } from '@/game/render/canvas/Camera';
import { TileRenderer } from '@/game/render/tiles/TileRenderer';
import type { SkiaCanvasLike, SkiaImageLike } from '@/game/render/tiles/TileRenderer';
import type { TileMap } from '@/game/render/tiles/TileMap';

import { DrawCommandFactories, type DrawCommand } from './DrawCommand';

/**
 * Inert canvas/image stubs — `computeBatch` never touches them (it is
 * the pure batching path); the casts document that intent loudly.
 */
const INERT_CANVAS = {
  save: () => undefined,
  restore: () => undefined,
  translate: () => undefined,
  scale: () => undefined,
  drawImageRect: () => undefined,
} as unknown as SkiaCanvasLike;
const INERT_IMAGE = { width: 0, height: 0 } as unknown as SkiaImageLike;

/** One map layer to emit, with its scene z-index (see `@/game/config` layers). */
export interface TileLayerSpec {
  /** Layer name inside the Tiled map. */
  readonly name: string;
  /** Draw-command z-index (LAYERS.ground, LAYERS.props, ...). */
  readonly zIndex: number;
}

/** Produces the current frame's tile commands for the given camera. */
export type TileCommandProducer = () => readonly DrawCommand[];

/**
 * Build a tile-command producer for one map. The producer culls and
 * run-merges each layer to the camera viewport every call — the map
 * never changes under the producer, only the camera moves.
 *
 * Unknown layer names are skipped (warned once) so a misnamed layer in
 * the scene config surfaces without crashing the loop.
 */
export function createTileCommandProducer(
  tileMap: TileMap,
  camera: Camera,
  layers: readonly TileLayerSpec[],
): TileCommandProducer {
  const warned = new Set<string>();
  // The batching path only reads `camera` + `tileMap`; canvas/image are
  // unused by `computeBatch` and replaced with inert stubs.
  const makeBatcher = (): TileRenderer =>
    new TileRenderer({
      canvas: INERT_CANVAS,
      camera,
      tileMap,
      tilesetImage: INERT_IMAGE,
    });

  return (): readonly DrawCommand[] => {
    const batcher = makeBatcher();
    const commands: DrawCommand[] = [];
    for (const spec of layers) {
      const layer = tileMap.getLayer(spec.name);
      if (!layer) {
        if (!warned.has(spec.name)) {
          warned.add(spec.name);
          logger.warn(`tileCommands: map has no layer "${spec.name}" — skipped`);
        }
        continue;
      }
      if (!layer.visible) continue;
      for (const op of batcher.computeBatch(layer)) {
        commands.push(
          DrawCommandFactories.tile(
            op.tileId,
            op.dest.x,
            op.dest.y,
            op.dest.width,
            op.dest.height,
            spec.zIndex,
          ),
        );
        // Surface mirror flips so the renderer can pivot correctly.
        const cmd = commands[commands.length - 1];
        if (op.flipX) cmd.flipX = true;
        if (op.flipY) cmd.flipY = true;
      }
    }
    return commands;
  };
}

export default createTileCommandProducer;
