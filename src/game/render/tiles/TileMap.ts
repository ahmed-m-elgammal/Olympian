/**
 * TileMap — Tiled-style JSON parser (spec 07 §3.4).
 *
 * Reads the JSON exported by the [Tiled](https://www.mapeditor.org/) map
 * editor and exposes:
 *
 *  - Dimensions in tiles (`getWidth`, `getHeight`) and in pixels
 *    (`getPixelWidth`, `getPixelHeight`).
 *  - Per-layer, per-cell tile lookup (`getTileAt`) returning the
 *    resolved source-rect inside the tileset image.
 *  - Layer lookup by name (`getLayer`).
 *  - Fast iteration for rendering (`iterateTiles`).
 *
 * The parser supports two Tiled layer encodings:
 *
 *  - `data: number[]` — a flattened row-major array of global tile
 *    IDs. Index of tile `(x, y)` is `y * layerWidth + x`. A `0` value
 *    means "no tile" (matches Tiled's convention).
 *  - `tiles: Array<{ tileId, x, y }>` — Tiled's "chunk" form (sparse
 *    tiles). Useful for object layers or partially filled grids.
 *
 * Multiple tilesets are supported; each tile is resolved against the
 * tileset whose `firstgid` range contains the tile's global ID.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';

/** A reference to a tileset used by the map. */
export interface TileSetRef {
  /** First global tile ID assigned to this tileset. */
  firstgid: number;
  /** Optional path/name of the .tsx source file. */
  source?: string;
  /** Optional path to the tileset image asset. */
  image?: string;
  /** Image width in pixels. */
  imagewidth?: number;
  /** Image height in pixels. */
  imageheight?: number;
  /** Per-tile width in pixels. */
  tilewidth: number;
  /** Per-tile height in pixels. */
  tileheight: number;
  /** Optional logical name. */
  name?: string;
}

/** Tiled layer shapes accepted by the parser. */
export interface TileLayerData {
  /** Layer name (used by `getLayer`). */
  name: string;
  /** Layer width in tiles. Inherits map width if omitted. */
  width?: number;
  /** Layer height in tiles. Inherits map height if omitted. */
  height?: number;
  /** Visible flag (Tiled). Defaults to true. */
  visible?: boolean;
  /** Flattened row-major tile IDs. */
  data?: number[];
  /** Sparse tile list. */
  tiles?: Array<{ tileId: number; x: number; y: number }>;
  /** Tiled layer type (`'tilelayer'`, `'objectgroup'`, etc). */
  type?: string;
}

/** One property of a Tiled object (canonical `{name, type, value}` form). */
export interface TiledObjectProperty {
  name: string;
  type?: string;
  value: string | number | boolean | unknown;
}

/** An object from an `objectgroup` layer (markers, spawns, triggers). */
export interface MapObject {
  /** Object name, e.g. `puzzle_1` / `spawn`. */
  name: string;
  /** Class tag, e.g. `marker` / `spawn`. */
  type: string;
  /** Top-left X in world px (Tiled rect semantics). */
  x: number;
  /** Top-left Y in world px. */
  y: number;
  width: number;
  height: number;
  /** Properties flattened into a plain record. */
  properties: Readonly<Record<string, string | number | boolean>>;
}

/** An `objectgroup` layer payload. */
export interface ObjectGroupData {
  name: string;
  visible?: boolean;
  type?: string;
  objects?: Array<{
    name?: string;
    type?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    properties?: TiledObjectProperty[];
  }>;
}

/** Root shape of a Tiled JSON export. */
export interface TileMapData {
  /** Map width in tiles. */
  width: number;
  /** Map height in tiles. */
  height: number;
  /** Per-tile width in pixels. */
  tilewidth: number;
  /** Per-tile height in pixels. */
  tileheight: number;
  /** Layers (rendered bottom-to-top in declaration order). */
  layers: Array<TileLayerData | ObjectGroupData>;
  /** Tilesets referenced by the map. */
  tilesets: TileSetRef[];
  /** Optional map name. */
  name?: string;
}

/** Tiled flip-flag bits (high 3 bits of a global tile ID). */
const FLIP_H_FLAG = 0x80000000;
const FLIP_V_FLAG = 0x40000000;
const FLIP_DIAG_FLAG = 0x20000000;
/** Mask that strips the flip flags, leaving the pure GID. */
const GID_MASK = 0x1fffffff;

/** A resolved tile: where to draw it (world) + where to sample (tileset). */
export interface Tile {
  /** Global tile ID (matches Tiled, flip flags stripped). */
  tileId: number;
  /** Tile X coordinate within the layer (column). */
  tx: number;
  /** Tile Y coordinate within the layer (row). */
  ty: number;
  /** World X (top-left) in pixels. */
  x: number;
  /** World Y (top-left) in pixels. */
  y: number;
  /** Source X in the tileset image. */
  srcX: number;
  /** Source Y in the tileset image. */
  srcY: number;
  /** Source width in pixels (== map's tilewidth unless overridden). */
  srcWidth: number;
  /** Source height in pixels (== map's tileheight unless overridden). */
  srcHeight: number;
  /** Tiled horizontal-flip flag (bit 0x80000000). */
  flipX: boolean;
  /** Tiled vertical-flip flag (bit 0x40000000). */
  flipY: boolean;
  /** Tiled diagonal-flip flag (bit 0x20000000) — a 90° transpose. */
  flipDiag: boolean;
  /** The tileset that owns this tile. */
  tileset: TileSetRef;
}

/** A parsed layer with resolved tiles. */
export interface Layer {
  /** Layer name. */
  name: string;
  /** Width in tiles. */
  width: number;
  /** Height in tiles. */
  height: number;
  /** Whether the layer is visible. */
  visible: boolean;
  /** All non-empty tiles in this layer (in render order). */
  tiles: Tile[];
  /**
   * O(1) tile lookup: maps `ty * width + tx` to its tile. Built at parse
   * time — `getTileAt` must not linearly scan `tiles` (that's O(n) per
   * lookup, fatal for collision queries in a 60Hz loop).
   */
  tileIndex: Map<number, Tile>;
}

/** A parsed objectgroup: named metadata layer (no render content). */
export interface ObjectLayer {
  name: string;
  visible: boolean;
  objects: MapObject[];
}

/**
 * Tiled map parser. Pure data — no Skia dependency.
 *
 * @example
 * ```ts
 * const map = new TileMap(tiledJson);
 * console.log(map.getWidth(), map.getHeight());      // in tiles
 * console.log(map.getPixelWidth(), map.getPixelHeight()); // in px
 * map.iterateTiles((tile, layer, x, y) => {
 *   renderer.drawTile(tile);
 * });
 * ```
 */
export class TileMap {
  /** Raw parsed data. */
  public readonly data: TileMapData;
  /** Parsed tile layers in declaration order (objectgroups excluded). */
  public readonly layers: Layer[];
  /** Parsed objectgroup layers in declaration order. */
  public readonly objectLayers: ObjectLayer[];
  /** Tilesets in ascending firstgid order. */
  public readonly tilesets: TileSetRef[];

  constructor(input: TileMapData | string) {
    const parsed: TileMapData =
      typeof input === 'string' ? (JSON.parse(input) as TileMapData) : input;
    if (!parsed || typeof parsed.width !== 'number') {
      throw new Error('TileMap: missing width');
    }
    this.data = parsed;
    this.tilesets = (parsed.tilesets ?? []).slice().sort((a, b) => a.firstgid - b.firstgid);
    this.layers = (parsed.layers ?? [])
      .filter((l): l is TileLayerData => l.type !== 'objectgroup')
      .map((l) => this.parseLayer(l));
    this.objectLayers = (parsed.layers ?? [])
      .filter((l): l is ObjectGroupData => l.type === 'objectgroup')
      .map((g) => this.parseObjectGroup(g));
  }

  /** Map width in tiles. */
  getWidth(): number {
    return this.data.width;
  }

  /** Map height in tiles. */
  getHeight(): number {
    return this.data.height;
  }

  /** Map width in pixels. */
  getPixelWidth(): number {
    return this.data.width * this.data.tilewidth;
  }

  /** Map height in pixels. */
  getPixelHeight(): number {
    return this.data.height * this.data.tileheight;
  }

  /** Per-tile width (px). */
  getTileWidth(): number {
    return this.data.tilewidth;
  }

  /** Per-tile height (px). */
  getTileHeight(): number {
    return this.data.tileheight;
  }

  /**
   * Look up a layer by name. Returns `null` if not found.
   */
  getLayer(name: string): Layer | null {
    return this.layers.find((l) => l.name === name) ?? null;
  }

  /**
   * All objects of one objectgroup layer. Returns `[]` when the layer
   * is missing so callers can degrade gracefully (warned at parse).
   */
  getObjects(groupName: string): MapObject[] {
    return this.objectLayers.find((g) => g.name === groupName)?.objects ?? [];
  }

  /**
   * Look up a layer by 0-based index. Returns `null` if out of range.
   */
  getLayerByIndex(index: number): Layer | null {
    if (index < 0 || index >= this.layers.length) return null;
    return this.layers[index] ?? null;
  }

  /**
   * Get the tile at the given tile-coordinate in the given layer.
   * O(1) via the per-layer hash index built at parse time.
   *
   * @param layerIndex 0-based layer index.
   * @param x          Tile X coordinate.
   * @param y          Tile Y coordinate.
   * @returns Resolved tile, or `null` if empty / out of bounds.
   */
  getTileAt(layerIndex: number, x: number, y: number): Tile | null {
    const layer = this.getLayerByIndex(layerIndex);
    if (!layer) return null;
    if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return null;
    return layer.tileIndex.get(y * layer.width + x) ?? null;
  }

  /**
   * Iterate every non-empty tile in every layer. The callback receives
   * the resolved tile, its layer, and the tile-space coordinates.
   *
   * Iteration order: layer 0 (bottom) → last layer (top), row-by-row.
   */
  iterateTiles(
    callback: (tile: Tile, layer: Layer, x: number, y: number) => void,
  ): void {
    for (const layer of this.layers) {
      for (const tile of layer.tiles) {
        callback(tile, layer, tile.tx, tile.ty);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Parse one Tiled layer (either `data: number[]` form or sparse
   * `tiles: [...]` form) into a flat list of resolved {@link Tile}s,
   * plus an O(1) lookup index keyed by `ty * width + tx`.
   */
  private parseLayer(layer: TileLayerData): Layer {
    const width = layer.width ?? this.data.width;
    const height = layer.height ?? this.data.height;
    const visible = layer.visible !== false;
    const tw = this.data.tilewidth;
    const th = this.data.tileheight;
    const tiles: Tile[] = [];
    const tileIndex = new Map<number, Tile>();

    const pushTile = (tileId: number, tx: number, ty: number): void => {
      const resolved = this.resolveTile(tileId, tx, ty, tw, th);
      if (resolved) {
        tiles.push(resolved);
        tileIndex.set(ty * width + tx, resolved);
      }
    };

    if (Array.isArray(layer.tiles)) {
      // Sparse form.
      for (const t of layer.tiles) {
        if (!t || t.tileId === 0) continue;
        if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) continue;
        pushTile(t.tileId, t.x, t.y);
      }
    } else if (Array.isArray(layer.data)) {
      // Flattened row-major form.
      const data = layer.data;
      if (data.length !== width * height) {
        logger.warn(
          `TileMap: layer "${layer.name}" data length ${data.length} != ${width}x${height} = ${width * height}`,
        );
      }
      for (let i = 0; i < data.length; i++) {
        const tileId = data[i];
        if (!tileId || tileId === 0) continue;
        const tx = i % width;
        const ty = Math.floor(i / width);
        if (tx >= width || ty >= height) continue;
        pushTile(tileId, tx, ty);
      }
    } else {
      logger.warn(`TileMap: layer "${layer.name}" has neither data[] nor tiles[]`);
    }

    return { name: layer.name, width, height, visible, tiles, tileIndex };
  }

  /**
   * Parse one `objectgroup` layer into plain {@link MapObject}s.
   * Properties arrive in Tiled's canonical `[{name, type, value}]` form
   * and are flattened into a record (last one wins). Malformed objects
   * are skipped with a warning — authoring metadata must never crash
   * the boot path.
   */
  private parseObjectGroup(group: ObjectGroupData): ObjectLayer {
    const objects: MapObject[] = [];
    for (const obj of group.objects ?? []) {
      if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
        logger.warn(`TileMap: objectgroup "${group.name}" has an object without x/y — skipped`);
        continue;
      }
      const properties: Record<string, string | number | boolean> = {};
      for (const prop of obj.properties ?? []) {
        if (prop && typeof prop.name === 'string') {
          properties[prop.name] = prop.value as string | number | boolean;
        }
      }
      objects.push({
        name: obj.name ?? '',
        type: obj.type ?? '',
        x: obj.x,
        y: obj.y,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
        properties,
      });
    }
    return { name: group.name, visible: group.visible !== false, objects };
  }

  /**
   * Resolve a global tile ID against the right tileset and compute
   * its source rect. Returns `null` if no tileset owns the ID.
   *
   * Tiled encodes per-tile flips in the high bits of the GID:
   *   0x80000000 horizontal, 0x40000000 vertical, 0x20000000 diagonal.
   * The flags are stripped for tileset lookup and exposed on the tile so
   * the renderer can draw the flipped orientation.
   */
  private resolveTile(
    rawGlobalTileId: number,
    tx: number,
    ty: number,
    tw: number,
    th: number,
  ): Tile | null {
    // eslint-disable-next-line no-bitwise
    const flipX = (rawGlobalTileId & FLIP_H_FLAG) !== 0;
    // eslint-disable-next-line no-bitwise
    const flipY = (rawGlobalTileId & FLIP_V_FLAG) !== 0;
    // eslint-disable-next-line no-bitwise
    const flipDiag = (rawGlobalTileId & FLIP_DIAG_FLAG) !== 0;
    // eslint-disable-next-line no-bitwise
    const gid = rawGlobalTileId & GID_MASK;
    if (gid === 0) return null;

    // Find the tileset whose [firstgid, nextFirstgid) range contains gid.
    let tileset: TileSetRef | null = null;
    for (let i = 0; i < this.tilesets.length; i++) {
      const ts = this.tilesets[i]!;
      const next = this.tilesets[i + 1];
      if (gid >= ts.firstgid && (!next || gid < next.firstgid)) {
        tileset = ts;
        break;
      }
    }
    if (!tileset) {
      logger.warn(`TileMap: no tileset owns gid ${gid}`);
      return null;
    }

    const localId = gid - tileset.firstgid;
    const imageWidth = tileset.imagewidth ?? 0;
    const imageHeight = tileset.imageheight ?? 0;
    const tileWidth = tileset.tilewidth || tw;
    const tileHeight = tileset.tileheight || th;
    const cols =
      imageWidth > 0 && tileWidth > 0
        ? Math.floor(imageWidth / tileWidth)
        : 1;

    // Bound the lookup by the tileset image's actual capacity. The last
    // tileset's gid range is unbounded (no `next` firstgid), so without
    // this check a garbage gid would "resolve" to a src rect outside the
    // image and draw nonsense.
    if (imageWidth > 0 && imageHeight > 0 && tileWidth > 0 && tileHeight > 0) {
      const capacity = cols * Math.floor(imageHeight / tileHeight);
      if (localId >= capacity) {
        logger.warn(
          `TileMap: gid ${gid} is outside tileset "${tileset.name ?? '?'}" capacity (${capacity} tiles)`,
        );
        return null;
      }
    }

    const srcX = (localId % cols) * tileWidth;
    const srcY = Math.floor(localId / cols) * tileHeight;

    return {
      tileId: gid,
      tx,
      ty,
      x: tx * tw,
      y: ty * th,
      srcX,
      srcY,
      srcWidth: tileWidth,
      srcHeight: tileHeight,
      flipX,
      flipY,
      flipDiag,
      tileset,
    };
  }
}

export default TileMap;
