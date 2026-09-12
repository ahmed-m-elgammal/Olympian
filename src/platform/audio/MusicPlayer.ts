/**
 * MusicPlayer — `react-native-sound` wrapper with crossfade
 * and ducking support (spec 11 §3.3).
 *
 * One music track plays at a time. `crossfadeTo()` smoothly transitions
 * the active track by fading the old one out and the new one in over
 * `durationMs`. `stop()` accepts an optional fade-out duration.
 *
 * Ducking: the mixer drives a duck factor (0..1) that multiplies the
 * user's music volume — e.g., `duck('music', 0.3, 200)` while a dialogue
 * overlay is open. The player doesn't know about the mixer; it just
 * receives `setDuckFactor()` calls and recomputes effective volume.
 *
 * NOTE: this deliberately uses `react-native-sound` (New Architecture
 * safe, same engine as SfxPool/AmbienceLayer) instead of
 * `react-native-track-player`, whose native TurboModule annotations
 * crash at startup on RN 0.87+ NewArch
 * ("returnType == void iff the method is synchronous").
 * The public API is unchanged so callers don't need to migrate.
 */

import Sound from 'react-native-sound';

import { logger } from '@/shared/log';
import { clamp } from '@/shared/math';

/** A music track to be played. `url` is a bundle-relative path (e.g. `music/act1.ogg`). */
export interface MusicTrack {
  id: string;
  url: string;
  title?: string;
  artist?: string;
}

/** Options for {@link MusicPlayer.play}. */
export interface MusicPlayOptions {
  /** Linear fade-in duration in milliseconds. Default 0 (no fade). */
  fadeInMs?: number;
}

/** Optional callbacks for track lifecycle events. */
export interface MusicPlayerCallbacks {
  /** Fires when the current track ends naturally (not via stop()). */
  onTrackEnd?: (trackId: string) => void;
  /** Fires on any playback error. */
  onError?: (error: Error) => void;
}

/** Constructor options for {@link MusicPlayer}. */
export interface MusicPlayerOptions {
  /** Base path passed to `new Sound(file, basePath, cb)`. */
  basePath?: string;
}

const DEFAULT_VOLUME = 0.8;
const FADE_STEP_MS = 16;

/**
 * Wraps react-native-sound. Use the exported {@link musicPlayer}
 * singleton, or instantiate directly in tests.
 */
export class MusicPlayer {
  private sound: Sound | null = null;
  private currentTrack: MusicTrack | null = null;
  private masterVolume = DEFAULT_VOLUME;
  private duckFactor = 1.0;
  private playing = false;
  private initialized = false;
  private readonly basePath: string;
  /** Bumped on every play/stop so stale async loads can't clobber the new track. */
  private generation = 0;
  private readonly fadeTimers = new Set<ReturnType<typeof setInterval>>();
  private readonly callbacks: MusicPlayerCallbacks = {};

  constructor(opts: MusicPlayerOptions = {}) {
    // Sound.MAIN_BUNDLE is a static string at runtime; safe to read here
    // (same pattern as SfxPool / AmbienceLayer).
    this.basePath = opts.basePath ?? Sound.MAIN_BUNDLE;
  }

  /** Set event callbacks. Merges with any prior callbacks. */
  setCallbacks(cb: MusicPlayerCallbacks): void {
    if (cb.onTrackEnd !== undefined) this.callbacks.onTrackEnd = cb.onTrackEnd;
    if (cb.onError !== undefined) this.callbacks.onError = cb.onError;
  }

  /**
   * Initialize the player. Idempotent. Safe in JS-only envs.
   * With react-native-sound there is no async native setup — this only
   * flips the flag (and sets the iOS category best-effort) so it can
   * never throw or crash boot.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      Sound.setCategory?.('Playback', true);
    } catch {
      /* ignore — category is best-effort */
    }
    this.initialized = true;
  }

  /**
   * Preload tracks. react-native-sound decodes on construction so true
   * streaming prewarm isn't needed — this is a no-op kept for API
   * symmetry with SfxPool.preload.
   */
  async preload(_tracks: MusicTrack[]): Promise<void> {
    /* no-op for now */
  }

  /**
   * Start playing `track` with an optional fade-in. Replaces any
   * currently-playing track (after a fade-out if requested via opts).
   */
  async play(track: MusicTrack, opts?: MusicPlayOptions): Promise<void> {
    await this.init();

    // No-op if the same track is already playing.
    if (this.currentTrack?.id === track.id && this.playing) return;

    // Cancel any in-flight fades FIRST. A pending stop(fadeOutMs) timer
    // would otherwise keep animating the volume to 0 and release the
    // player after this new track has started (fade-race dataflow bug).
    this.cancelFades();

    const fadeInMs = opts?.fadeInMs ?? 0;
    const startVolume = fadeInMs > 0 ? 0 : this.effectiveVolume();
    const gen = ++this.generation;

    // Tear down the previous sound before loading the new one.
    this.releaseSound();

    let loaded: Sound;
    try {
      loaded = await this.loadSound(track.url);
    } catch (e) {
      if (gen !== this.generation) return; // superseded by a newer play()
      logger.warn(`[music] failed to load "${track.id}"`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    if (gen !== this.generation) {
      // A newer play()/stop() superseded this load — release the stale sound.
      try {
        loaded.release();
      } catch {
        /* ignore */
      }
      return;
    }

    this.sound = loaded;
    this.currentTrack = track;

    try {
      loaded.setVolume(startVolume);
    } catch (e) {
      logger.warn(`[music] setVolume failed for "${track.id}"`, e);
    }
    this.playing = true;
    try {
      loaded.play((success) => {
        // Only the latest generation owns the end-of-track signal.
        if (gen !== this.generation) return;
        if (!success) {
          this.callbacks.onError?.(new Error(`[music] playback failed for "${track.id}"`));
          return;
        }
        const id = this.currentTrack?.id ?? null;
        this.playing = false;
        if (id) this.callbacks.onTrackEnd?.(id);
      });
    } catch (e) {
      logger.warn(`[music] failed to play "${track.id}"`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      this.playing = false;
      return;
    }

    if (fadeInMs > 0) {
      this.fade(0, this.effectiveVolume(), fadeInMs);
    }
  }

  /**
   * Crossfade from the current track to `track` over `durationMs`.
   * The old track is stopped immediately and the new track fades in —
   * a true two-track overlap isn't possible with a single Sound
   * instance, so the perceptual crossfade is the new track's fade-in.
   */
  async crossfadeTo(track: MusicTrack, durationMs: number): Promise<void> {
    await this.init();

    if (this.currentTrack?.id === track.id && this.playing) return;

    // Cancel in-flight fades — there is a single volume knob, and a
    // pending stop()/crossfade fade fighting this one would produce a
    // garbled volume ramp (or kill the new track via a stale release).
    this.cancelFades();

    const gen = ++this.generation;
    this.releaseSound();

    let loaded: Sound;
    try {
      loaded = await this.loadSound(track.url);
    } catch (e) {
      if (gen !== this.generation) return;
      logger.warn(`[music] crossfadeTo "${track.id}" failed`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    if (gen !== this.generation) {
      try {
        loaded.release();
      } catch {
        /* ignore */
      }
      return;
    }

    this.sound = loaded;
    this.currentTrack = track;

    try {
      loaded.setVolume(0);
    } catch {
      /* ignore */
    }
    this.playing = true;
    try {
      loaded.play((success) => {
        if (gen !== this.generation) return;
        if (!success) {
          this.callbacks.onError?.(new Error(`[music] playback failed for "${track.id}"`));
          return;
        }
        const id = this.currentTrack?.id ?? null;
        this.playing = false;
        if (id) this.callbacks.onTrackEnd?.(id);
      });
    } catch (e) {
      logger.warn(`[music] crossfadeTo "${track.id}" failed`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      this.playing = false;
      return;
    }

    this.fade(0, this.effectiveVolume(), Math.max(0, durationMs));
  }

  /** Stop the current track, optionally fading out. */
  async stop(fadeOutMs?: number): Promise<void> {
    if (fadeOutMs && fadeOutMs > 0 && this.playing) {
      const gen = this.generation;
      this.fade(this.effectiveVolume(), 0, fadeOutMs, () => {
        // Only release if no newer play() superseded this fade.
        if (gen !== this.generation) return;
        this.resetInternal();
      });
      return;
    }
    this.cancelFades();
    this.resetInternal();
  }

  /** Pause playback. State retained so resume() can pick up. */
  async pause(): Promise<void> {
    try {
      this.sound?.pause();
    } catch (e) {
      logger.warn('[music] pause failed', e);
    }
    this.playing = false;
  }

  /** Resume from pause. */
  async resume(): Promise<void> {
    const s = this.sound;
    if (!s || !this.currentTrack) {
      this.playing = false;
      return;
    }
    const gen = this.generation;
    const trackId = this.currentTrack.id;
    try {
      s.play((success) => {
        if (gen !== this.generation) return;
        if (!success) {
          this.callbacks.onError?.(new Error(`[music] playback failed for "${trackId}"`));
          return;
        }
        this.playing = false;
        this.callbacks.onTrackEnd?.(trackId);
      });
      this.playing = true;
    } catch (e) {
      logger.warn('[music] resume failed', e);
      this.playing = false;
    }
  }

  /** Set the music master volume (0..1). Persists via mixer. */
  setVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    this.applyVolume();
  }

  /** Set duck factor (0..1) applied by the mixer. */
  setDuckFactor(factor: number): void {
    this.duckFactor = clamp(factor, 0, 1);
    this.applyVolume();
  }

  /** Current music master volume (without duck factor applied). */
  getVolume(): number {
    return this.masterVolume;
  }

  /** Effective volume after ducking (0..1). */
  getEffectiveVolume(): number {
    return this.effectiveVolume();
  }

  /** Active track id, or null if nothing is loaded. */
  getCurrentTrack(): string | null {
    return this.currentTrack?.id ?? null;
  }

  /** True if a track is currently playing. */
  get isPlaying(): boolean {
    return this.playing;
  }

  /** Tear down: stop all fades, release the Sound. Safe to call repeatedly. */
  async destroy(): Promise<void> {
    this.generation++;
    this.cancelFades();
    this.resetInternal();
  }

  // -- internal helpers -----------------------------------------------------

  private effectiveVolume(): number {
    return clamp(this.masterVolume * this.duckFactor, 0, 1);
  }

  private applyVolume(): void {
    const s = this.sound;
    if (!s) return;
    try {
      s.setVolume(this.effectiveVolume());
    } catch (e) {
      logger.warn('[music] setVolume failed', e);
    }
  }

  private releaseSound(): void {
    const s = this.sound;
    this.sound = null;
    if (!s) return;
    try {
      s.stop();
    } catch {
      /* ignore */
    }
    try {
      s.release();
    } catch {
      /* ignore */
    }
  }

  private resetInternal(): void {
    this.releaseSound();
    this.currentTrack = null;
    this.playing = false;
  }

  /**
   * Load a Sound for `file`, rejecting when the native load fails.
   * Handles both async callbacks (real device) and synchronous callbacks
   * (test mocks that invoke `cb` inside the constructor, before `new`
   * has returned).
   */
  private loadSound(file: string): Promise<Sound> {
    return new Promise<Sound>((resolve, reject) => {
      let instance: Sound | undefined;
      let syncCalled = false;
      let syncErr: unknown;
      const fail = (e: unknown): Error =>
        e instanceof Error ? e : new Error(String(e));
      try {
        instance = new Sound(file, this.basePath, (err: unknown) => {
          if (!instance) {
            // Synchronous callback during construction — defer the
            // resolve/reject until `instance` is assigned below.
            syncCalled = true;
            syncErr = err;
            return;
          }
          if (err) {
            try {
              instance.release();
            } catch {
              /* ignore */
            }
            reject(fail(err));
            return;
          }
          resolve(instance);
        });
      } catch (e) {
        reject(fail(e));
        return;
      }
      if (syncCalled) {
        const s = instance;
        if (syncErr) {
          try {
            s?.release();
          } catch {
            /* ignore */
          }
          reject(fail(syncErr));
        } else if (s) {
          resolve(s);
        } else {
          reject(new Error(`[music] failed to load "${file}"`));
        }
      }
    });
  }

  /**
   * Animate volume from `from` to `to` over `ms`.
   * Uses setInterval at ~60Hz. Only one fade runs at a time — starting a
   * new fade cancels the previous one (single shared volume knob), which
   * makes crossfadeTo→stop→play interruptions deterministic.
   */
  private fade(
    from: number,
    to: number,
    ms: number,
    onComplete?: () => void,
  ): void {
    // One volume knob: starting a new fade cancels any in-flight one so
    // two timers never fight over `setVolume` per frame.
    this.cancelFades();
    const steps = Math.max(1, Math.ceil(ms / FADE_STEP_MS));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const t = clamp(i / steps, 0, 1);
      const v = clamp(from + (to - from) * t, 0, 1);
      try {
        this.sound?.setVolume(v);
      } catch {
        /* ignore transient errors during fade */
      }
      if (i >= steps) {
        clearInterval(timer);
        this.fadeTimers.delete(timer);
        try {
          onComplete?.();
        } catch (e) {
          logger.warn('[music] fade onComplete threw', e);
        }
      }
    }, FADE_STEP_MS);
    this.fadeTimers.add(timer);
  }

  private cancelFades(): void {
    for (const t of this.fadeTimers) clearInterval(t);
    this.fadeTimers.clear();
  }
}

/** Singleton MusicPlayer instance for app use. Tests should construct their own. */
export const musicPlayer = new MusicPlayer();
