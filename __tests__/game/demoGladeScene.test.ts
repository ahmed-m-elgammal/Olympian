/**
 * Integration tests for the demo-glade scene (P2.E1.T9/T11): the
 * assembled world must spawn the hero on a clear tile, animate him,
 * move him with an input stub, collide with the map walls, and publish
 * sorted draw lists (tiles + sprite) through the injected publisher.
 */

import atlasTiles from '../../assets/sprites/atlas_tiles.json';
// Tests MAY import the generator side (scripts/) to pin cross-boundary
// contracts — the app itself never does.
import { DEMO_SPAWN as GENERATOR_SPAWN } from '../../scripts/sprites/tileArt';

import { GameLoop } from '@/game/engine/loop/GameLoop';
import type { DrawCommand } from '@/game/engine/render/DrawCommand';
import type { CameraTransform } from '@/game/render/canvas/Camera';
import {
  createDemoGladeScene,
  DEMO_SPAWN_TILE,
  type DemoGladeScene,
} from '@/game/scenes';
import { ATLAS_IDS, tileEntries } from '@/game/render/atlas/atlasRegistry';
import { LAYERS } from '@/game/config/layers';
import { HERO_SPEED_PX_SEC } from '@/game/config/gameplay';

const DT = 1 / 60;

interface Captured {
  frames: Array<{ commands: readonly DrawCommand[]; camera: CameraTransform }>;
}

function makeScene(input: { x: number; y: number }): { scene: DemoGladeScene; captured: Captured } {
  const captured: Captured = { frames: [] };
  const scene = createDemoGladeScene({
    publish: (commands, camera) => {
      captured.frames.push({ commands, camera });
    },
    inputSource: { getMove: () => input },
  });
  return { scene, captured };
}

describe('demo-glade scene assembly', () => {
  it('spawns the hero at the generator-consistent tile', () => {
    // Cross-boundary contract: the scene spawn must match the map
    // generator's kept-clear tile (src never imports scripts — this
    // test is the pin).
    expect(DEMO_SPAWN_TILE).toEqual(GENERATOR_SPAWN);
    const { scene } = makeScene({ x: 0, y: 0 });
    const pos = scene.ecs.getComponent(scene.heroId, 'position')!;
    const tileW = scene.map.getTileWidth();
    const tileH = scene.map.getTileHeight();
    expect(pos.x).toBe((DEMO_SPAWN_TILE.tx + 0.5) * tileW);
    expect(pos.y).toBe((DEMO_SPAWN_TILE.ty + 1) * tileH);
  });

  it('spawns the hero on a non-solid tile inside map bounds', () => {
    const { scene } = makeScene({ x: 0, y: 0 });
    const pos = scene.ecs.getComponent(scene.heroId, 'position')!;
    expect(scene.gameWorld.collisionSpace.intersectsSolid({ x: pos.x - 5, y: pos.y - 8, width: 10, height: 8 })).toBe(false);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(scene.map.getPixelWidth());
    expect(pos.y).toBeLessThan(scene.map.getPixelHeight());
  });

  it('loads the demo map at its baked dimensions', () => {
    const { scene } = makeScene({ x: 0, y: 0 });
    expect(scene.map.getWidth()).toBe(30);
    expect(scene.map.getHeight()).toBe(28);
    expect(scene.map.getPixelWidth()).toBe(480);
    expect(scene.map.getPixelHeight()).toBe(448);
    expect(scene.map.getLayer('ground')).not.toBeNull();
    expect(scene.map.getLayer('obstacles')).not.toBeNull();
  });

  it('seeds the animation table from the hero manifest', () => {
    const { scene } = makeScene({ x: 0, y: 0 });
    // 11 animations per the bake contract.
    expect(scene.animationTable.size).toBe(11);
    expect(scene.animationTable.has('hero_walk_left')).toBe(true);
    expect(scene.animationTable.has('hero_death_down')).toBe(true);
  });

  it('treats exactly the manifest-solid tiles as collision', () => {
    const { scene } = makeScene({ x: 0, y: 0 });
    const solidNames = (atlasTiles as { tiles: Array<{ name: string; solid: boolean }> })
      .tiles.filter((t) => t.solid)
      .map((t) => t.name);
    expect(solidNames.sort()).toEqual(['bush', 'rock', 'stone_wall']);
    // The obstacle layer contains only solid tiles (or nothing).
    const layer = scene.map.getLayer('obstacles')!;
    for (const tile of layer.tiles) {
      expect(solidNames).toContain(tileEntries(ATLAS_IDS.tiles)[tile.tileId - 1].name);
    }
  });
});

describe('demo-glade simulation', () => {
  it('moves the hero up and switches to the up walk cycle', () => {
    const { scene } = makeScene({ x: 0, y: -1 });
    const before = scene.ecs.getComponent(scene.heroId, 'position')!.y;

    scene.gameWorld.step(DT);

    const after = scene.ecs.getComponent(scene.heroId, 'position')!.y;
    expect(after).toBeCloseTo(before - HERO_SPEED_PX_SEC * DT, 5);
    expect(scene.ecs.getComponent(scene.heroId, 'facing')!.dir).toBe('up');
    expect(scene.ecs.getComponent(scene.heroId, 'animation')!.current).toBe('hero_walk_up');
  });

  it('animates the sprite frame as time accumulates', () => {
    const { scene } = makeScene({ x: 1, y: 0 });
    // Step ~250ms: at 8fps the 6-frame walk cycle must be past frame 1.
    for (let i = 0; i < 15; i++) scene.gameWorld.step(DT);
    const anim = scene.ecs.getComponent(scene.heroId, 'animation')!;
    expect(anim.frame).toBeGreaterThanOrEqual(1);
    const sprite = scene.ecs.getComponent(scene.heroId, 'sprite')!;
    expect(sprite.spriteId).toMatch(/^hero_walk_right_\d$/);
  });

  it('cannot walk into the border stone walls (map edge collision)', () => {
    const { scene } = makeScene({ x: 0, y: 1 }); // walk down toward the bottom wall
    // 3 seconds of walking must stop at the wall above row 27.
    for (let i = 0; i < 180; i++) scene.gameWorld.step(DT);
    const pos = scene.ecs.getComponent(scene.heroId, 'position')!;
    // Bottom wall row starts at tile y=27 → 432px; the collider never
    // overlaps solid tiles.
    expect(pos.y).toBeLessThanOrEqual(432);
    expect(
      scene.gameWorld.collisionSpace.intersectsSolid({ x: pos.x - 5, y: pos.y - 8, width: 10, height: 8 }),
    ).toBe(false);
  });

  it('publishes draw lists with tiles below actors and a camera transform', () => {
    const { scene, captured } = makeScene({ x: 0, y: 0 });
    scene.camera.setViewport(320, 180);
    // Let the camera converge onto the hero first — the camera starts
    // at the map origin and the hero spawns further in, so an
    // unstepped render would legitimately cull him.
    for (let i = 0; i < 120; i++) scene.gameWorld.step(DT);
    scene.gameWorld.render();

    expect(captured.frames.length).toBe(1);
    const { commands, camera } = captured.frames[0];
    expect(commands.length).toBeGreaterThan(1);

    const tileCmds = commands.filter((c) => c.type === 'tile');
    const spriteCmds = commands.filter((c) => c.type === 'sprite');
    expect(tileCmds.length).toBeGreaterThan(0);
    expect(spriteCmds.length).toBe(1); // the hero

    // Ground tiles render first; the actor never under the ground.
    const maxTileZ = Math.max(...tileCmds.map((c) => c.zIndex));
    expect(spriteCmds[0]!.zIndex).toBe(LAYERS.actors);
    expect(maxTileZ).toBeLessThanOrEqual(LAYERS.props);
    // Ground layer present with its own z.
    expect(tileCmds.some((c) => c.zIndex === LAYERS.ground)).toBe(true);

    expect(camera.scale).toBe(2); // GAME_ZOOM
  });

  it('is drivable by the fixed-timestep GameLoop', () => {
    const { scene } = makeScene({ x: 1, y: 0 });
    const loop = new GameLoop(scene.gameWorld);
    const before = scene.ecs.getComponent(scene.heroId, 'position')!.x;
    loop.tick(100); // one manual tick (100ms → up to 5 steps + render)
    loop.stop();
    const after = scene.ecs.getComponent(scene.heroId, 'position')!.x;
    expect(after).toBeGreaterThan(before);
  });
});
