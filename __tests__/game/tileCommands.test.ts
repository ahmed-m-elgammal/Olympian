/**
 * Tests for the tile draw-command producer (spec 07 §3.2/§8): camera
 * culling, horizontal run merging, per-layer z-index, and flip
 * passthrough — over an in-memory Tiled map.
 */

import { TileMap } from '@/game/render/tiles/TileMap';
import { Camera } from '@/game/render/canvas/Camera';
import {
  createTileCommandProducer,
  type TileLayerSpec,
} from '@/game/engine/render/tileCommands';
import { logger } from '@/shared/log';

/** 4×3 map, 16px tiles. Tileset local ids 1..3 (firstgid 1). */
function makeMap(): TileMap {
  return new TileMap({
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    layers: [
      {
        name: 'ground',
        type: 'tilelayer',
        width: 4,
        height: 3,
        // Row-major: row 0 = [1,1,2,0] → ids 1,1 merge, 2 breaks the run.
        data: [1, 1, 2, 0, 1, 1, 1, 1, 0, 0, 0, 0],
      },
      {
        name: 'obstacles',
        type: 'tilelayer',
        width: 4,
        height: 3,
        data: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
      },
    ],
    tilesets: [{ firstgid: 1, name: 'atlas_tiles', tilewidth: 16, tileheight: 16 }],
  });
}

const LAYERS: TileLayerSpec[] = [
  { name: 'ground', zIndex: 0 },
  { name: 'obstacles', zIndex: 20 },
];

function makeCamera(x = 0, y = 0, width = 64, height = 48): Camera {
  const camera = new Camera();
  camera.setZoom(1);
  camera.setViewport(width, height);
  camera.setPosition(x, y);
  return camera;
}

describe('createTileCommandProducer', () => {
  it('emits one command per merged run with the layer z-index', () => {
    const producer = createTileCommandProducer(makeMap(), makeCamera(), LAYERS);
    const commands = producer();

    // Visible: 4×2 tiles. Ground row 0 merges [1,1] → 1 cmd; [2] → 1 cmd;
    // row 1 merges [1,1,1,1] → 1 cmd. Obstacles: [3] → 1 cmd.
    expect(commands).toHaveLength(4);

    const ground = commands.filter((c) => c.zIndex === 0);
    expect(ground).toHaveLength(3);
    // First merged run: 2 tiles wide at the origin.
    expect(ground[0]).toMatchObject({ type: 'tile', tileId: 1, x: 0, y: 0, width: 32, height: 16 });
    // Row 1 run: 4 tiles wide.
    const rowRun = ground.find((c) => c.y === 16);
    expect(rowRun).toMatchObject({ tileId: 1, width: 64, height: 16 });

    const obstacles = commands.filter((c) => c.zIndex === 20);
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]).toMatchObject({ type: 'tile', tileId: 3, x: 16 * 3, y: 16, width: 16, height: 16 });
  });

  it('culls tiles outside the camera viewport', () => {
    // Viewport only covers the first tile column.
    const camera = makeCamera(0, 0, 16, 16);
    const producer = createTileCommandProducer(makeMap(), camera, LAYERS);
    const commands = producer();
    // Row 0: [1,1] run clipped... — the run spans x 0..32 but only tile
    // (0,0) is fully inside; TileRenderer keeps partial-overlap runs
    // (dest starts inside), so exactly the row-0 run is visible.
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ tileId: 1, x: 0, y: 0 });
  });

  it('follows the camera (empty view → no commands)', () => {
    const camera = makeCamera(10_000, 10_000, 64, 48);
    const producer = createTileCommandProducer(makeMap(), camera, LAYERS);
    expect(producer()).toHaveLength(0);
  });

  it('skips unknown layer names with a single warning', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const producer = createTileCommandProducer(makeMap(), makeCamera(), [
      { name: 'nope', zIndex: 5 },
      { name: 'nope', zIndex: 5 },
    ]);
    expect(producer()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('skips invisible layers', () => {
    const map = new TileMap({
      width: 1,
      height: 1,
      tilewidth: 16,
      tileheight: 16,
      layers: [
        { name: 'hidden', type: 'tilelayer', visible: false, width: 1, height: 1, data: [1] },
      ],
      tilesets: [{ firstgid: 1, name: 't', tilewidth: 16, tileheight: 16 }],
    });
    const producer = createTileCommandProducer(map, makeCamera(0, 0, 16, 16), [
      { name: 'hidden', zIndex: 0 },
    ]);
    expect(producer()).toHaveLength(0);
  });
});
