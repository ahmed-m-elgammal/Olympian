/**
 * SceneManager — scene lifecycle orchestration (spec 07 §5, P2.E2.T3).
 *
 * Owns the GameLoop and the currently-live {@link SceneHandle}.
 * `loadScene(spec)` runs the spec'd sequence:
 *
 *   1. Save persistent entities   — P2 scenes rebuild from data; there
 *      are no persistent entities yet (the save system arrives later —
 *      this is the documented hook point).
 *   2. Destroy transient entities — the previous handle (and its whole
 *      ECS world) is dropped.
 *   3. Create the new scene       — the injected {@link SceneBuilder}
 *      parses the map, assembles systems, spawns `spec.entities`.
 *   4. Reset camera               — builder snaps it to `playerSpawn`.
 *   5. Reset input                — injected reset (UI store adapter).
 *   6. Audio cross-fade           — injected {@link SceneAudioBridge}
 *      fades to `spec.music` + swaps the ambience bed.
 *
 * The manager also forwards loop controls so screens drive exactly one
 * object: `start()` / `stop()` / `setPaused()` (AppState) / `dispose()`.
 * Reloading while running swaps the loop's world seamlessly (the rAF
 * cadence continues; `GameLoop.reset()` drops stale accumulated time).
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import { GameLoop } from '../loop/GameLoop';
import type {
  SceneAudioBridge,
  SceneBuilder,
  SceneHandle,
  SceneSpec,
} from './types';

/** Constructor dependencies. */
export interface SceneManagerOptions {
  /** Builds a live scene from a spec (map parse + systems + entities). */
  readonly buildScene: SceneBuilder;
  /** Applies scene audio (cross-fade / ambience swap). */
  readonly audio: SceneAudioBridge;
  /** Clears transient player input on every load (spec 07 §5 step 5). */
  readonly resetInput: () => void;
}

export class SceneManager {
  private readonly buildScene: SceneBuilder;
  private readonly audio: SceneAudioBridge;
  private readonly resetInput: () => void;

  private loop: GameLoop | null = null;
  private handle: SceneHandle | null = null;
  private spec: SceneSpec | null = null;
  private running = false;

  constructor(options: SceneManagerOptions) {
    this.buildScene = options.buildScene;
    this.audio = options.audio;
    this.resetInput = options.resetInput;
  }

  /** The live scene spec, or null before the first load. */
  get current(): SceneSpec | null {
    return this.spec;
  }

  /** The live scene handle, or null before the first load. */
  get scene(): SceneHandle | null {
    return this.handle;
  }

  /** Whether the loop is ticking. */
  get isRunning(): boolean {
    return this.running && this.loop !== null;
  }

  /**
   * Load a scene (spec 07 §5). Safe to call repeatedly — each call
   * replaces the previous scene. When the manager is running, the new
   * scene starts ticking immediately.
   */
  loadScene(spec: SceneSpec): SceneHandle {
    // 2. Destroy transient entities (drop the whole previous world).
    if (this.loop) {
      this.loop.stop();
      this.loop = null;
    }

    // 3. Create the new scene's entities (builder parses map + spawns).
    const handle = this.buildScene(spec);

    // 4. Camera reset — the builder snapped it; nothing to do here.
    // 5. Reset input so no stale joystick vector leaks into the scene.
    this.resetInput();

    // 6. Audio cross-fade to the new scene's music + ambience. The
    //    bridge owns the transition (same-track no-op, bed swap, fade-out
    //    when the new scene has no ambience) — `exit` is teardown only.
    this.audio.enter(spec.music, spec.ambience);

    // 1. Persistent entities: none in P2 (hook point — see module docs).

    this.spec = spec;
    this.handle = handle;

    // Swap the loop over the new world; keep the running state.
    const loop = new GameLoop(handle.gameWorld);
    this.loop = loop;
    if (this.running) {
      loop.start();
    }

    logger.info(`[scene] loaded "${spec.id}" (${spec.type})`);
    return handle;
  }

  /** Start ticking the live scene. Safe to call repeatedly. */
  start(): void {
    this.running = true;
    this.loop?.start();
  }

  /** Stop ticking (screen blurred / covered). Input is cleared so a
   *  held joystick can't leak into the next focus. */
  stop(): void {
    this.running = false;
    this.loop?.stop();
    this.resetInput();
  }

  /** Pause/resume without tearing the rAF down (AppState contract). */
  setPaused(paused: boolean): void {
    this.loop?.setPaused(paused);
  }

  /** Manual single-tick entry (tests drive the simulation with this). */
  tick(deltaMs: number): void {
    this.loop?.tick(deltaMs);
  }

  /**
   * Tear everything down (screen unmount): stop the loop, release the
   * scene, fade scene audio. The manager is reusable after dispose.
   */
  dispose(): void {
    this.stop();
    if (this.spec) {
      this.audio.exit();
    }
    this.loop = null;
    this.handle = null;
    this.spec = null;
  }
}

export default SceneManager;
