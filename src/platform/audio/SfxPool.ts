/**
 * SfxPool — preloaded sound-effect instance pool (spec 11 §3.4).
 *
 * Wraps `react-native-sound`. The pool keeps N preloaded `Sound` instances
 * per sound id so rapid-fire triggers (e.g., 4 quick sword swings) don't
 * all try to share one instance. When `play()` is called, an idle instance
 * is reused; if all are busy, the oldest is interrupted and reused.
 *
 * Why preloaded instances: `react-native-sound` decodes the file in the
 * constructor — by preloading we keep tap-to-sfx latency ≤ 100ms
 * (spec 11 §1).
 *
 * Pool size: total simultaneous `Sound` objects across all sound ids
 * (default 32). When exceeded, finished instances are recycled to make
 * room. This bounds memory usage to ~32 × ~50KB ≈ 1.6MB per spec 11 §5.2.
 */

import Sound from 'react-native-sound';

import { logger } from '@/shared/log';
import { clamp } from '@/shared/math';

/**
 * A handle to a single triggered sound. Returned by `play()` so the
 * caller can stop this instance specifically (without affecting other
 * concurrent instances of the same sound id).
 */
export interface SoundInstance {
  /** Stable instance id; empty string when play failed (e.g., not preloaded). */
  readonly id: string;
  /** Stop just this instance. Safe to call multiple times. */
  stop: () => void;
}

/** Options passed to {@link SfxPool.play}. */
export interface SfxPlayOptions {
  /** Per-call volume multiplier (0..1). Combined with pool + mixer volumes. */
  volume?: number;
  /**
   * Playback rate (0.5 = half speed, 1 = normal, 2 = double). On iOS this
   * maps to `Sound.setSpeed`; on Android the underlying native module
   * applies `setPitch` for variety (pitch shifting is not a real "rate"
   * but is the closest cross-platform lever react-native-sound exposes).
   */
  rate?: number;
  /** Loop indefinitely until {@link SoundInstance.stop} is called. */
  loop?: boolean;
}

/** Constructor options for {@link SfxPool}. */
export interface SfxPoolOptions {
  /** Max simultaneous Sound instances across all ids (default 32). */
  poolSize?: number;
  /** Base path passed to `new Sound(file, basePath, cb)`. */
  basePath?: string;
}

/** A single preloaded Sound instance within the pool. */
interface PoolEntry {
  sound: Sound;
  soundId: string;
  instanceId: string;
  /** True while this instance has been started and not yet stopped/ended. */
  playing: boolean;
  /** True when the underlying Sound failed to load. */
  loadError: boolean;
  /** Per-call volume multiplier from the last `play()` call. */
  baseVolume: number;
}

/**
 * Preloaded SFX instance pool. Wraps `react-native-sound`. Use the
 * exported {@link sfxPool} singleton, or instantiate directly in tests.
 */
export class SfxPool {
  /** All loaded entries, flat. Used for pool-size accounting + release. */
  private readonly entries: PoolEntry[] = [];
  /** Entries grouped by sound id for fast lookup in play(). */
  private readonly bySoundId: Map<string, PoolEntry[]> = new Map();
  /** Per-sound master volume multiplier (set via setVolume). */
  private readonly soundMaster: Map<string, number> = new Map();
  /** File path per sound id (for reference / debugging). */
  private readonly files: Map<string, string> = new Map();
  /** Group volume applied by the mixer ('sfx' group). */
  private groupVolume = 1.0;
  private readonly poolSize: number;
  private readonly basePath: string;
  private counter = 0;

  constructor(opts: SfxPoolOptions = {}) {
    this.poolSize = opts.poolSize ?? 32;
    // Sound.MAIN_BUNDLE is a static string at runtime; safe to read here.
    this.basePath = opts.basePath ?? Sound.MAIN_BUNDLE;
  }

  /**
   * Load one Sound instance for `soundId` into the pool. Multiple calls
   * for the same id create multiple instances (spec 11 §5.2 calls for
   * 3 per SFX). If the pool is at capacity, the oldest finished instance
   * is recycled.
   *
   * Resolves even if the underlying Sound fails to load (a loadError flag
   * is recorded on the entry so play() can skip it).
   */
  preload(soundId: string, file: string): Promise<void> {
    this.files.set(soundId, file);
    return new Promise<void>((resolve) => {
      // Enforce pool-size cap by recycling the oldest idle entry.
      if (this.entries.length >= this.poolSize) {
        const idle = this.entries.find((e) => !e.playing);
        if (idle) {
          this.removeEntry(idle);
          try {
            idle.sound.release();
          } catch {
            /* ignore */
          }
        }
      }

      const instanceId = `sfx_${++this.counter}`;
      const entry: PoolEntry = {
        sound: undefined as unknown as Sound,
        soundId,
        instanceId,
        playing: false,
        loadError: false,
        baseVolume: 1,
      };

      let constructed: Sound;
      try {
        // react-native-sound signature: new Sound(filename, basePath, cb)
        constructed = new Sound(file, this.basePath, (err: unknown) => {
          if (err) {
            entry.loadError = true;
            logger.warn(
              `[sfx] preload failed for "${soundId}" from "${file}"`,
              err,
            );
          }
          resolve();
        });
      } catch (e) {
        entry.loadError = true;
        logger.warn(`[sfx] Sound constructor threw for "${soundId}"`, e);
        // Construct a no-op stub so the entry is at least addressable.
        constructed = {
          play: () => constructed,
          stop: () => constructed,
          pause: () => constructed,
          release: () => constructed,
          setVolume: () => constructed,
          setNumberOfLoops: () => constructed,
          isLoaded: () => false,
          isPlaying: () => false,
          getDuration: () => 0,
        } as unknown as Sound;
        resolve();
      }
      entry.sound = constructed;

      this.entries.push(entry);
      const list = this.bySoundId.get(soundId);
      if (list) {
        list.push(entry);
      } else {
        this.bySoundId.set(soundId, [entry]);
      }
    });
  }

  /**
   * Play a preloaded sound. Returns a SoundInstance handle. If the sound
   * is not preloaded (or all instances errored on load), returns a no-op
   * handle and logs a warning — never throws.
   */
  play(soundId: string, options?: SfxPlayOptions): SoundInstance {
    const list = this.bySoundId.get(soundId);
    if (!list || list.length === 0) {
      logger.warn(`[sfx] "${soundId}" not preloaded — play ignored`);
      return NOOP_INSTANCE;
    }

    // Find an idle instance (not currently playing, no load error).
    const entry =
      list.find((e) => !e.playing && !e.loadError) ??
      list.find((e) => !e.loadError) ??
      list[0];

    if (entry.loadError) {
      logger.warn(`[sfx] "${soundId}" has no usable instance — play ignored`);
      return NOOP_INSTANCE;
    }

    // Reset the chosen instance before reusing.
    try {
      entry.sound.stop();
    } catch {
      /* ignore */
    }

    entry.baseVolume = clamp(options?.volume ?? 1, 0, 1);
    this.applyVolume(entry);

    if (options?.loop) {
      try {
        entry.sound.setNumberOfLoops(-1);
      } catch {
        /* ignore */
      }
    }
    if (options?.rate !== undefined) {
      try {
        // setSpeed exists on both platforms' type defs; may no-op on Android.
        entry.sound.setSpeed(clamp(options.rate, 0.25, 4));
      } catch {
        /* ignore */
      }
    }

    entry.playing = true;
    try {
      entry.sound.play((success) => {
        entry.playing = false;
        if (!success) {
          logger.debug(`[sfx] play completed with success=false for "${soundId}"`);
        }
      });
    } catch (e) {
      logger.warn(`[sfx] play() threw for "${soundId}"`, e);
      entry.playing = false;
      return NOOP_INSTANCE;
    }

    return {
      id: entry.instanceId,
      stop: () => this.stop(soundId, entry.instanceId),
    };
  }

  /**
   * Stop one instance (by id) or all instances of a sound id.
   * Safe to call on already-stopped instances.
   */
  stop(soundId: string, instanceId?: string): void {
    const list = this.bySoundId.get(soundId);
    if (!list) return;
    for (const entry of list) {
      if (instanceId && entry.instanceId !== instanceId) continue;
      try {
        entry.sound.stop();
      } catch {
        /* ignore */
      }
      entry.playing = false;
    }
  }

  /**
   * Set the per-sound master volume. Affects currently-playing instances
   * of this sound id and all future plays. Combined multiplicatively
   * with the mixer's group volume and the per-call `volume` option.
   */
  setVolume(soundId: string, volume: number): void {
    const v = clamp(volume, 0, 1);
    this.soundMaster.set(soundId, v);
    const list = this.bySoundId.get(soundId);
    if (!list) return;
    for (const entry of list) {
      if (entry.playing) this.applyVolume(entry);
    }
  }

  /**
   * Set the group volume (0..1) applied by the mixer to ALL sfx.
   * Re-applies to every currently-playing instance.
   */
  setGroupVolume(volume: number): void {
    this.groupVolume = clamp(volume, 0, 1);
    for (const entry of this.entries) {
      if (entry.playing) this.applyVolume(entry);
    }
  }

  /** True if any instance of `soundId` is currently playing. */
  isPlaying(soundId: string): boolean {
    const list = this.bySoundId.get(soundId);
    return !!list?.some((e) => e.playing);
  }

  /** Number of loaded instances for `soundId`. */
  instanceCount(soundId: string): number {
    return this.bySoundId.get(soundId)?.length ?? 0;
  }

  /** Total number of loaded instances across all ids. */
  totalInstances(): number {
    return this.entries.length;
  }

  /** Release every loaded Sound and clear the pool. Safe to call repeatedly. */
  release(): void {
    for (const entry of this.entries) {
      try {
        entry.sound.release();
      } catch {
        /* ignore */
      }
    }
    this.entries.length = 0;
    this.bySoundId.clear();
    this.soundMaster.clear();
    this.files.clear();
  }

  // -- internal helpers -----------------------------------------------------

  private applyVolume(entry: PoolEntry): void {
    const master = this.soundMaster.get(entry.soundId) ?? 1;
    const v = clamp(this.groupVolume * master * entry.baseVolume, 0, 1);
    try {
      entry.sound.setVolume(v);
    } catch {
      /* ignore */
    }
  }

  private removeEntry(entry: PoolEntry): void {
    const idx = this.entries.indexOf(entry);
    if (idx >= 0) this.entries.splice(idx, 1);
    const list = this.bySoundId.get(entry.soundId);
    if (list) {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.bySoundId.delete(entry.soundId);
    }
  }
}

/** No-op handle returned when play() can't fire (not preloaded, errors). */
const NOOP_INSTANCE: SoundInstance = {
  id: '',
  stop: () => {
    /* no-op */
  },
};

/** Singleton SfxPool instance for app use. Tests should construct their own. */
export const sfxPool = new SfxPool();
