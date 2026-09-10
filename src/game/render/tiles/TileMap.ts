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
  layers: TileLayerData[];
  /** Tilesets referenced by the map. */
  tilesets: TileSetRef[];
  /** Optional map name. */
  name?: string;
}

/** A resolved tile: where to draw it (world) + where to sample (tileset). */
export interface Tile {
  /** Global tile ID (matches Tiled). */
  tileId: number;
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
  /** Parsed layers in declaration order. */
  public readonly layers: Layer[];
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
    this.layers = (parsed.layers ?? []).map((l) => this.parseLayer(l));
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
   * Look up a layer by 0-based index. Returns `null` if out of range.
   */
  getLayerByIndex(index: number): Layer | null {
    if (index < 0 || index >= this.layers.length) return null;
    return this.layers[index] ?? null;
  }

  /**
   * Get the tile at the given tile-coordinate in the given layer.
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
    return layer.tiles.find((t) => t.x === x * this.data.tilewidth && t.y === y * this.data.tileheight) ?? null;
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
    const tw = this.data.tilewidth;
    const th = this.data.tileheight;
    for (const layer of this.layers) {
      for (const tile of layer.tiles) {
        callback(tile, layer, Math.floor(tile.x / tw), Math.floor(tile.y / th));
      }
    }
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Parse one Tiled layer (either `data: number[]` form or sparse
   * `tiles: [...]` form) into a flat list of resolved {@link Tile}s.
   */
  private parseLayer(layer: TileLayerData): Layer {
    const width = layer.width ?? this.data.width;
    const height = layer.height ?? this.data.height;
    const visible = layer.visible !== false;
    const tw = this.data.tilewidth;
    const th = this.data.tileheight;
    const tiles: Tile[] = [];

    if (Array.isArray(layer.tiles)) {
      // Sparse form.
      for (const t of layer.tiles) {
        if (!t || t.tileId === 0) continue;
        const resolved = this.resolveTile(t.tileId, t.x * tw, t.y * th, tw, th);
        if (resolved) tiles.push(resolved);
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
        const resolved = this.resolveTile(tileId, tx * tw, ty * th, tw, th);
        if (resolved) tiles.push(resolved);
      }
    } else {
      logger.warn(`TileMap: layer "${layer.name}" has neither data[] nor tiles[]`);
    }

    return { name: layer.name, width, height, visible, tiles };
  }

  /**
   * Resolve a global tile ID against the right tileset and compute
   * its source rect. Returns `null` if no tileset owns the ID.
   */
  private resolveTile(
    globalTileId: number,
    worldX: number,
    worldY: number,
    tw: number,
    th: number,
  ): Tile | null {
    // Strip Tiled flip flags (high 3 bits).
    // eslint-disable-next-line no-bitwise
    const gid = globalTileId & 0x1fffffff;
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
    const tileWidth = tileset.tilewidth || tw;
    const tileHeight = tileset.tileheight || th;
    const cols =
      imageWidth > 0 && tileWidth > 0
        ? Math.floor(imageWidth / tileWidth)
        : 1;
    const srcX = (localId % cols) * tileWidth;
    const srcY = Math.floor(localId / cols) * tileHeight;

    return {
      tileId: gid,
      x: worldX,
      y: worldY,
      srcX,
      srcY,
      srcWidth: tileWidth,
      srcHeight: tileHeight,
      tileset,
    };
  }
}

export default TileMap;
