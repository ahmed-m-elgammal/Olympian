/**
 * Tests for TileMap — Tiled JSON parsing (spec 07 §3.4).
 *
 * Covers:
 *  - Dimensions, layer/tileset parsing (data[] and sparse tiles[] forms).
 *  - O(1) `getTileAt` lookup (regression: this used to be a linear scan
 *    over every tile in the layer).
 *  - Tiled flip flags (bits 0x80000000 / 0x40000000 / 0x20000000) are
 *    parsed and exposed — not silently stripped.
 *  - `iterateTiles` yields tile-space coordinates.
 */

import { TileMap, type TileMapData } from '@/game/render/tiles/TileMap';

function makeMapData(): TileMapData {
  return {
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      {
        firstgid: 1,
        tilewidth: 16,
        tileheight: 16,
        imagewidth: 64,
        imageheight: 16,
        name: 'tiles',
      },
    ],
    layers: [
      {
        name: 'ground',
        // Row-major 4x3: tile 1 everywhere except two gaps.
        data: [
          1, 1, 1, 1,
          1, 0, 1, 1,
          1, 1, 1, 1,
        ],
      },
      {
        name: 'sparse',
        tiles: [
          { tileId: 2, x: 1, y: 2 },
          { tileId: 3, x: 3, y: 0 },
        ],
      },
    ],
  };
}

describe('TileMap (spec 07 §3.4)', () => {
  it('parses dimensions in tiles and pixels', () => {
    const map = new TileMap(makeMapData());
    expect(map.getWidth()).toBe(4);
    expect(map.getHeight()).toBe(3);
    expect(map.getPixelWidth()).toBe(64);
    expect(map.getPixelHeight()).toBe(48);
    expect(map.getTileWidth()).toBe(16);
    expect(map.getTileHeight()).toBe(16);
  });

  it('resolves tiles from the flattened data[] form', () => {
    const map = new TileMap(makeMapData());
    const ground = map.getLayer('ground')!;
    expect(ground.tiles.length).toBe(11); // 12 cells minus 1 zero

    const first = ground.tiles[0]!;
    expect(first.tileId).toBe(1);
    expect(first.tx).toBe(0);
    expect(first.ty).toBe(0);
    expect(first.x).toBe(0);
    expect(first.y).toBe(0);
    expect(first.srcX).toBe(0);
    expect(first.srcY).toBe(0);
    expect(first.srcWidth).toBe(16);
    expect(first.srcHeight).toBe(16);
  });

  it('resolves tiles from the sparse tiles[] form with world coords', () => {
    const map = new TileMap(makeMapData());
    const layer = map.getLayer('sparse')!;
    expect(layer.tiles.length).toBe(2);

    const t = layer.tiles[0]!; // tileId 2 at (1, 2)
    expect(t.tx).toBe(1);
    expect(t.ty).toBe(2);
    expect(t.x).toBe(16);
    expect(t.y).toBe(32);
    // localId 1 → srcX = 1*16
    expect(t.srcX).toBe(16);

    const t2 = layer.tiles[1]!;
    expect(t2.tx).toBe(3);
    expect(t2.ty).toBe(0);
    expect(t2.x).toBe(48);
    expect(t2.y).toBe(0);
  });

  describe('getTileAt — O(1) index lookup', () => {
    it('returns the tile at a coordinate and null for gaps/bounds', () => {
      const map = new TileMap(makeMapData());
      // Present.
      expect(map.getTileAt(0, 0, 0)?.tileId).toBe(1);
      expect(map.getTileAt(0, 3, 2)?.tileId).toBe(1);
      // Gap (data[5] === 0 → (1,1)).
      expect(map.getTileAt(0, 1, 1)).toBeNull();
      // Out of bounds.
      expect(map.getTileAt(0, -1, 0)).toBeNull();
      expect(map.getTileAt(0, 0, -1)).toBeNull();
      expect(map.getTileAt(0, 4, 0)).toBeNull();
      expect(map.getTileAt(0, 0, 3)).toBeNull();
      // Unknown layer index.
      expect(map.getTileAt(9, 0, 0)).toBeNull();
    });

    it('performs 10k lookups without scanning (performance guard)', () => {
      // Regression guard: the old implementation did `layer.tiles.find(...)`
      // per lookup — O(n). With the hash index this is O(1); even a large
      // map completes instantly.
      const big: TileMapData = {
        width: 256,
        height: 192,
        tilewidth: 16,
        tileheight: 16,
        tilesets: [
          { firstgid: 1, tilewidth: 16, tileheight: 16, imagewidth: 64, imageheight: 16 },
        ],
        layers: [
          {
            name: 'ground',
            data: new Array(256 * 192).fill(1),
          },
        ],
      };
      const map = new TileMap(big);
      const start = Date.now();
      for (let i = 0; i < 10_000; i++) {
        expect(map.getTileAt(0, i % 256, Math.floor(i / 256) % 192)?.tileId).toBe(1);
      }
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });

  describe('Tiled flip flags', () => {
    it('parses horizontal flip (0x80000000) and strips it from the gid', () => {
      const data = makeMapData();
      (data.layers[0] as { data: number[] }).data = [0x80000001];
      const map = new TileMap(data);
      const tile = map.getTileAt(0, 0, 0)!;
      expect(tile.tileId).toBe(1); // flags stripped
      expect(tile.flipX).toBe(true);
      expect(tile.flipY).toBe(false);
      expect(tile.flipDiag).toBe(false);
    });

    it('parses vertical flip (0x40000000)', () => {
      const data = makeMapData();
      (data.layers[0] as { data: number[] }).data = [0x40000001];
      const map = new TileMap(data);
      const tile = map.getTileAt(0, 0, 0)!;
      expect(tile.tileId).toBe(1);
      expect(tile.flipX).toBe(false);
      expect(tile.flipY).toBe(true);
      expect(tile.flipDiag).toBe(false);
    });

    it('parses diagonal flip (0x20000000) and combined flags', () => {
      const data = makeMapData();
      (data.layers[0] as { data: number[] }).data = [0x20000001, 0xe0000001];
      const map = new TileMap(data);
      const diag = map.getTileAt(0, 0, 0)!;
      expect(diag.flipDiag).toBe(true);
      expect(diag.flipX).toBe(false);
      expect(diag.flipY).toBe(false);

      const all = map.getTileAt(0, 1, 0)!;
      expect(all.flipX).toBe(true);
      expect(all.flipY).toBe(true);
      expect(all.flipDiag).toBe(true);
    });
  });

  it('iterateTiles yields tile-space coordinates via tx/ty', () => {
    const map = new TileMap(makeMapData());
    const seen: Array<{ x: number; y: number }> = [];
    map.iterateTiles((_tile, _layer, x, y) => {
      seen.push({ x, y });
    });
    // All non-empty ground tiles (11) + 2 sparse tiles.
    expect(seen.length).toBe(13);
    expect(seen[0]).toEqual({ x: 0, y: 0 });
  });

  it('round-trips a JSON string', () => {
    const map = new TileMap(JSON.stringify(makeMapData()));
    expect(map.getLayer('ground')).not.toBeNull();
  });

  it('warns on tiles outside tileset capacity or ownership (skips them)', () => {
    // Case 1: gid below every firstgid → no tileset owns it.
    const noOwner = makeMapData();
    noOwner.tilesets = [{ ...noOwner.tilesets[0]!, firstgid: 2 }];
    (noOwner.layers[0] as { data: number[] }).data = [1];
    const mapNoOwner = new TileMap(noOwner);
    expect(mapNoOwner.getTileAt(0, 0, 0)).toBeNull();

    // Case 2: the last tileset's range is unbounded by next-firstgid, so
    // the image-capacity bound must reject out-of-range gids (regression:
    // gid 99 used to "resolve" to a src rect beyond the 64×16 image).
    const overCapacity = makeMapData();
    (overCapacity.layers[0] as { data: number[] }).data = [99];
    const mapOver = new TileMap(overCapacity);
    expect(mapOver.getTileAt(0, 0, 0)).toBeNull();

    // Sanity: the highest in-capacity gid (4 tiles in a 64×16 strip →
    // gids 1..4) still resolves.
    const lastValid = makeMapData();
    (lastValid.layers[0] as { data: number[] }).data = [4];
    const mapValid = new TileMap(lastValid);
    expect(mapValid.getTileAt(0, 0, 0)?.srcX).toBe(48);
  });
});
