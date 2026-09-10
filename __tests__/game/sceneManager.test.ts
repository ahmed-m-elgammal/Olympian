/**
 * SceneManager tests (P2.E2.T3): the spec 07 §5 loadScene sequence —
 * builder called with the spec, previous scene dropped, input reset,
 * audio cross-fade, loop retargeting — plus start/stop/dispose.
 *
 * The deps are spies; the built handle wraps a real GameWorld with a
 * step-counting system so loop handoff is observable.
 */

import { Camera } from '@/game/render/canvas/Camera';
import { GameWorld } from '@/game/engine/GameWorld';
import { AnimationTable } from '@/game/engine/animation/AnimationTable';
import { SceneManager } from '@/game/engine/scene/SceneManager';
import type {
  SceneAudioBridge,
  SceneBuilder,
  SceneHandle,
  SceneSpec,
} from '@/game/engine/scene/types';
import type { CollisionSpace } from '@/game/engine/systems/collision';
import type { System } from '@/game/engine/systems';
import type { World } from '@/game/engine/ecs/World';

const COLLISION: CollisionSpace = {
  bounds: { minX: 0, minY: 0, maxX: 480, maxY: 448 },
  intersectsSolid: () => false,
};

/** Build a real-but-minimal handle whose steps are counted. */
function makeHandle(spawn: { x: number; y: number }, steps: number[]): SceneHandle {
  const camera = new Camera();
  camera.follow(spawn, 1);
  const stepCounter: System = (_world: World, dt: number) => {
    steps.push(dt);
  };
  const gameWorld = new GameWorld({
    collision: COLLISION,
    animations: new AnimationTable({}),
    frameSizeOf: () => ({ width: 16, height: 16 }),
    publish: () => undefined,
    systems: [stepCounter],
    camera,
  });
  return {
    gameWorld,
    camera,
    entityIds: [],
    map: { getPixelWidth: () => 480, getPixelHeight: () => 448 },
    animations: { has: () => false },
  };
}

function makeSpec(id: string, music = 'tutorial'): SceneSpec {
  return {
    type: 'overworld',
    id,
    tilemap: 'demo_glade',
    entities: [],
    music,
    ambience: 'amb_act1',
    playerSpawn: { x: 100, y: 100 },
  };
}

interface DepsSpy {
  builderSpecs: string[];
  inputResets: number;
  enters: Array<{ music: string; ambience?: string }>;
  exits: number;
  handles: SceneHandle[];
}

function makeManager(): { manager: SceneManager; spy: DepsSpy } {
  const spy: DepsSpy = { builderSpecs: [], inputResets: 0, enters: [], exits: 0, handles: [] };
  const steps: number[] = [];
  const builder: SceneBuilder = (spec) => {
    spy.builderSpecs.push(spec.id);
    const handle = makeHandle(spec.playerSpawn, steps);
    spy.handles.push(handle);
    return handle;
  };
  const audio: SceneAudioBridge = {
    enter: (music, ambience) => spy.enters.push({ music, ambience }),
    exit: () => spy.exits++,
  };
  const manager = new SceneManager({
    buildScene: builder,
    audio,
    resetInput: () => spy.inputResets++,
  });
  return { manager, spy };
}

describe('SceneManager.loadScene (spec 07 §5)', () => {
  it('builds the scene, resets input, and cross-fades the audio', () => {
    const { manager, spy } = makeManager();
    const spec = makeSpec('scene_a');

    const handle = manager.loadScene(spec);

    expect(handle).toBe(spy.handles[0]);
    expect(spy.builderSpecs).toEqual(['scene_a']);
    expect(spy.inputResets).toBe(1);
    expect(spy.enters).toEqual([{ music: 'tutorial', ambience: 'amb_act1' }]);
    expect(spy.exits).toBe(0);
    expect(manager.current).toBe(spec);
    expect(manager.scene).toBe(handle);
  });

  it('drops the previous world on reload; the bridge owns the transition', () => {
    const { manager, spy } = makeManager();
    const first = manager.loadScene(makeSpec('scene_a'));
    const firstWorld = first.gameWorld;

    manager.loadScene(makeSpec('scene_b', 'act1_explore'));

    expect(spy.builderSpecs).toEqual(['scene_a', 'scene_b']);
    // exit() is teardown-only: scene→scene transitions go through
    // enter() (the bridge swaps tracks/beds without a restart blip).
    expect(spy.exits).toBe(0);
    expect(spy.enters[1]).toEqual({ music: 'act1_explore', ambience: 'amb_act1' });
    // The previous handle's world is no longer the live one.
    expect(manager.scene!.gameWorld).not.toBe(firstWorld);
    expect(manager.current!.id).toBe('scene_b');
  });

  it('resets input between loads (stale joystick never leaks)', () => {
    const { manager, spy } = makeManager();
    manager.loadScene(makeSpec('scene_a'));
    manager.loadScene(makeSpec('scene_b'));
    expect(spy.inputResets).toBe(2);
  });
});

describe('SceneManager loop lifecycle', () => {
  // start() registers a rAF chain; a live chain would keep jest alive
  // after the suite. The tests drive the loop manually via tick().
  beforeAll(() => {
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterAll(() => {
    (global.requestAnimationFrame as jest.Mock).mockRestore();
    (global.cancelAnimationFrame as jest.Mock).mockRestore();
  });

  it('ticks the live world while running and stops on stop()', () => {
    const { manager } = makeManager();
    manager.loadScene(makeSpec('scene_a'));

    manager.start();
    manager.tick(16);
    manager.tick(16);

    expect(manager.isRunning).toBe(true);

    manager.stop();
    expect(manager.isRunning).toBe(false);
  });

  it('keeps the running state across a reload (loop retargets)', () => {
    const { manager, spy } = makeManager();
    manager.start();
    manager.loadScene(makeSpec('scene_a'));
    manager.loadScene(makeSpec('scene_b'));
    manager.tick(16);

    // The loop survived the swap and the new scene is live.
    expect(manager.isRunning).toBe(true);
    expect(manager.current!.id).toBe('scene_b');
    expect(spy.builderSpecs).toEqual(['scene_a', 'scene_b']);
  });

  it('does not tick while stopped', () => {
    const { manager } = makeManager();
    manager.loadScene(makeSpec('scene_a'));
    manager.tick(16); // not started — no crash, no run
    expect(manager.isRunning).toBe(false);
  });

  it('dispose tears down and is safe to reuse afterwards', () => {
    const { manager, spy } = makeManager();
    manager.start();
    manager.loadScene(makeSpec('scene_a'));

    manager.dispose();

    expect(manager.isRunning).toBe(false);
    expect(manager.scene).toBeNull();
    expect(manager.current).toBeNull();
    expect(spy.exits).toBeGreaterThanOrEqual(1);

    // Reusable after dispose.
    manager.loadScene(makeSpec('scene_c'));
    manager.start();
    expect(manager.isRunning).toBe(true);
    manager.dispose();
  });
});
