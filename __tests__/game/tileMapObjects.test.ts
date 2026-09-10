/**
 * TileMap objectgroup parsing (P2.E2.T2/T4): Tiled `objectgroup` layers
 * surface authoring metadata (markers, spawns) as plain records.
 */

import { TileMap, type TileMapData } from '@/game/render/tiles/TileMap';

function mapWithObjects(): TileMapData {
  return {
    width: 8,
    height: 8,
    tilewidth: 16,
    tileheight: 16,
    layers: [
      {
        name: 'ground',
        type: 'tilelayer',
        data: new Array(64).fill(0),
      },
      {
        name: 'objects',
        type: 'objectgroup',
        objects: [
          {
            name: 'puzzle_1',
            type: 'marker',
            x: 16,
            y: 32,
            width: 16,
            height: 16,
            properties: [
              { name: 'kind', type: 'string', value: 'puzzle' },
              { name: 'target', type: 'string', value: 'act1_area1_room1' },
              { name: 'labelKey', type: 'string', value: 'acts:act_0.markers.puzzle_1' },
            ],
          },
          { name: 'spawn', type: 'spawn', x: 64, y: 64, width: 16, height: 16, properties: [] },
        ],
      },
    ],
    tilesets: [{ firstgid: 1, tilewidth: 16, tileheight: 16 }],
  };
}

describe('TileMap objectgroup parsing', () => {
  it('exposes objectgroup objects with flattened properties', () => {
    const map = new TileMap(mapWithObjects());
    const objects = map.getObjects('objects');

    expect(objects).toHaveLength(2);

    const marker = objects.find((o) => o.name === 'puzzle_1')!;
    expect(marker.type).toBe('marker');
    expect(marker.x).toBe(16);
    expect(marker.y).toBe(32);
    expect(marker.properties).toEqual({
      kind: 'puzzle',
      target: 'act1_area1_room1',
      labelKey: 'acts:act_0.markers.puzzle_1',
    });

    const spawn = objects.find((o) => o.name === 'spawn')!;
    expect(spawn.properties).toEqual({});
  });

  it('keeps objectgroups out of the renderable tile layers', () => {
    const map = new TileMap(mapWithObjects());
    expect(map.layers.map((l) => l.name)).toEqual(['ground']);
    expect(map.objectLayers.map((l) => l.name)).toEqual(['objects']);
  });

  it('returns an empty list for a missing objectgroup (graceful)', () => {
    const map = new TileMap(mapWithObjects());
    expect(map.getObjects('nope')).toEqual([]);
  });

  it('skips objects without coordinates instead of throwing', () => {
    const data = mapWithObjects();
    (data.layers[1] as { objects: Array<Record<string, unknown>> }).objects.push({
      name: 'broken',
      type: 'marker',
      // no x/y
    });
    const map = new TileMap(data);
    const objects = map.getObjects('objects');
    expect(objects.map((o) => o.name)).toEqual(['puzzle_1', 'spawn']);
  });

  it('parses legacy maps without any objectgroup', () => {
    const data = mapWithObjects();
    data.layers = [data.layers[0]];
    const map = new TileMap(data);
    expect(map.objectLayers).toEqual([]);
    expect(map.getLayer('ground')).not.toBeNull();
  });
});
