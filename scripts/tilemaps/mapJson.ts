/**
 * Tiled-JSON assembly helpers for the generated maps (spec 07 §3.4).
 *
 * The runtime `TileMap` parser accepts the canonical Tiled JSON shape:
 * dense `data: number[]` tile layers plus `objectgroup` layers for
 * authoring metadata (markers, spawns). These helpers emit that shape
 * from plain builder calls so every map generator produces consistent,
 * validated JSON without hand-writing brackets.
 *
 * Conventions:
 *  - Layers are dense row-major arrays; `0` = empty (Tiled convention).
 *  - Objects are rectangles: `x`/`y` are the TOP-LEFT of the rect in
 *    world pixels, `width`/`height` its size (Tiled's rect semantics).
 *  - Properties use Tiled's canonical `[{name, type, value}]` form and
 *    are parsed into a plain record at runtime.
 *
 * @packageDocumentation
 */

/** A dense tile layer payload. */
export interface DenseLayer {
  readonly name: string;
  /** Row-major GIDs; length must be width × height. */
  readonly data: readonly number[];
}

/** Canonical Tiled object property (string-typed subset we emit). */
export interface TiledObjectProperty {
  readonly name: string;
  readonly type: 'string' | 'int' | 'bool';
  readonly value: string | number | boolean;
}

/** An object inside an objectgroup (rect form). */
export interface TiledMapObject {
  readonly name: string;
  /** Free-form class tag, e.g. `marker` / `spawn`. */
  readonly type: string;
  /** Top-left X in world px. */
  readonly x: number;
  /** Top-left Y in world px. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties: readonly TiledObjectProperty[];
}

/** An objectgroup layer payload. */
export interface ObjectGroup {
  readonly name: string;
  readonly objects: readonly TiledMapObject[];
}

/** Assemble one dense tilelayer in Tiled's export shape. */
export function tileLayerJson(
  layer: DenseLayer,
  width: number,
  height: number,
): object {
  if (layer.data.length !== width * height) {
    throw new Error(
      `mapJson: layer "${layer.name}" data length ${layer.data.length} != ${width}x${height}`,
    );
  }
  return {
    name: layer.name,
    type: 'tilelayer',
    visible: true,
    width,
    height,
    data: [...layer.data],
  };
}

/** Assemble one objectgroup layer in Tiled's export shape. */
export function objectGroupJson(group: ObjectGroup): object {
  return {
    name: group.name,
    type: 'objectgroup',
    visible: true,
    objects: group.objects.map((o) => ({
      name: o.name,
      type: o.type,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      properties: o.properties.map((p) => ({ ...p })),
    })),
  };
}

/** Assemble the full Tiled map document. */
export function tiledMapJson(opts: {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tileLayers: readonly DenseLayer[];
  readonly objectGroups: readonly ObjectGroup[];
  readonly firstgid: number;
  readonly tilesetName: string;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
}): unknown {
  return {
    name: opts.name,
    width: opts.width,
    height: opts.height,
    tilewidth: 16,
    tileheight: 16,
    layers: [
      ...opts.tileLayers.map((l) => tileLayerJson(l, opts.width, opts.height)),
      ...opts.objectGroups.map(objectGroupJson),
    ],
    tilesets: [
      {
        firstgid: opts.firstgid,
        name: opts.tilesetName,
        tilewidth: 16,
        tileheight: 16,
        image: 'atlas_tiles.png',
        imagewidth: opts.atlasWidth,
        imageheight: opts.atlasHeight,
      },
    ],
  };
}
