/**
 * Collision space — solid geometry queries for the `MovementSystem`
 * (spec 07 §1.5 "intent + velocity → position, collision check").
 *
 * P2.E1 solids are:
 *  - the map's **obstacle tile layer** (Tiled tile ids flagged solid in
 *    the tileset manifest), exposed through {@link TileCollisionSpace};
 *  - scene bounds (entities never leave the map);
 *  - other entities' solid `Collider` boxes (checked by the
 *    MovementSystem directly, since that needs component access).
 *
 * The interface exists so the MovementSystem never knows about Tiled:
 * puzzle rooms (P2.E3) can supply grid-based solids without touching
 * movement code.
 *
 * @packageDocumentation
 */

import { TileMap, type Tile } from '@/game/render/tiles/TileMap';

/** Axis-aligned rectangle in world pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** World bounds (closed interval — entities clamp inside). */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Solid-geometry queries used by movement. */
export interface CollisionSpace {
  /** Map bounds entities cannot leave. */
  readonly bounds: WorldBounds;
  /** Whether the rect overlaps any solid tile. */
  intersectsSolid(rect: Rect): boolean;
}

/**
 * Tile-backed collision space over the demo/overworld Tiled map.
 *
 * Solid lookup is O(tiles overlapped): the rect covers at most
 * `ceil(w/16) × ceil(h/16)` tiles for gameplay-sized colliders, and
 * `TileMap.getTileAt` is O(1) (hash index, spec 07 §3.4).
 */
export class TileCollisionSpace implements CollisionSpace {
  /** GIDs treated as solid (built from the tileset manifest). */
  private readonly solidGids: ReadonlySet<number>;
  /** Index of the obstacle layer inside the map. */
  private readonly obstacleLayerIndex: number;
  private readonly map: TileMap;

  constructor(map: TileMap, solidGids: ReadonlySet<number>, obstacleLayerName: string) {
    this.map = map;
    this.solidGids = solidGids;
    const index = map.layers.findIndex((l) => l.name === obstacleLayerName);
    if (index === -1) {
      throw new Error(
        `TileCollisionSpace: map has no layer named "${obstacleLayerName}"`,
      );
    }
    this.obstacleLayerIndex = index;
    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: map.getPixelWidth(),
      maxY: map.getPixelHeight(),
    };
  }

  /** Map bounds in world pixels. */
  public readonly bounds: WorldBounds;

  /** Whether the rect overlaps any solid obstacle tile. */
  intersectsSolid(rect: Rect): boolean {
    const tileW = this.map.getTileWidth();
    const tileH = this.map.getTileHeight();
    const tx0 = Math.floor(rect.x / tileW);
    const ty0 = Math.floor(rect.y / tileH);
    const tx1 = Math.floor((rect.x + rect.width - Number.EPSILON) / tileW);
    const ty1 = Math.floor((rect.y + rect.height - Number.EPSILON) / tileH);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile: Tile | null = this.map.getTileAt(this.obstacleLayerIndex, tx, ty);
        if (tile && this.solidGids.has(tile.tileId)) return true;
      }
    }
    return false;
  }
}

/**
 * AABB overlap test. Touching edges do NOT count (strict inequality)
 * so entities can slide along walls without jitter.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
