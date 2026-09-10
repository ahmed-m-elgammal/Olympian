/**
 * MusicPlayer — `react-native-track-player` wrapper with crossfade
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
 */

import TrackPlayer, { Event } from 'react-native-track-player';

import { logger } from '@/shared/log';
import { clamp } from '@/shared/math';

/** A music track to be played. `url` is resolved by TrackPlayer. */
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
  /** Fires on any TrackPlayer error. */
  onError?: (error: Error) => void;
}

const DEFAULT_VOLUME = 0.8;
const FADE_STEP_MS = 16;

/**
 * Wraps react-native-track-player. Use the exported {@link musicPlayer}
 * singleton, or instantiate directly in tests.
 */
export class MusicPlayer {
  private currentTrack: MusicTrack | null = null;
  private masterVolume = DEFAULT_VOLUME;
  private duckFactor = 1.0;
  private playing = false;
  private initialized = false;
  private readonly fadeTimers = new Set<ReturnType<typeof setInterval>>();
  private readonly callbacks: MusicPlayerCallbacks = {};

  /** Set event callbacks. Merges with any prior callbacks. */
  setCallbacks(cb: MusicPlayerCallbacks): void {
    if (cb.onTrackEnd !== undefined) this.callbacks.onTrackEnd = cb.onTrackEnd;
    if (cb.onError !== undefined) this.callbacks.onError = cb.onError;
  }

  /** Initialize the underlying TrackPlayer. Idempotent. Safe in JS-only envs. */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({ capabilities: [] });
    } catch (e) {
      // setupPlayer can throw on Android-in-background or in test envs;
      // log but don't rethrow so callers can degrade gracefully.
      logger.warn('[music] TrackPlayer setupPlayer failed', e);
    }
    try {
      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
        const id = this.currentTrack?.id ?? null;
        this.playing = false;
        if (id) this.callbacks.onTrackEnd?.(id);
      });
      TrackPlayer.addEventListener(Event.PlaybackError, (e: unknown) => {
        const msg =
          (e as { error?: unknown } | null | undefined)?.error ?? e;
        this.callbacks.onError?.(new Error(String(msg)));
      });
      TrackPlayer.addEventListener(Event.PlayerError, (e: unknown) => {
        const msg =
          (e as { error?: unknown } | null | undefined)?.error ?? e;
        this.callbacks.onError?.(new Error(String(msg)));
      });
    } catch (e) {
      logger.warn('[music] addEventListener failed', e);
    }
    this.initialized = true;
  }

  /**
   * Preload tracks. react-native-track-player streams on demand so this
   * is currently a no-op kept for API symmetry with SfxPool.preload —
   * a future implementation may warm the media cache here.
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
    // would otherwise keep animating the volume to 0 and reset() the
    // player after this new track has started (fade-race dataflow bug).
    this.cancelFades();

    const fadeInMs = opts?.fadeInMs ?? 0;
    const startVolume = fadeInMs > 0 ? 0 : this.effectiveVolume();

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: track.url,
        title: track.title ?? track.id,
        artist: track.artist ?? 'Olympian OST',
      });
      await TrackPlayer.setVolume(startVolume);
      await TrackPlayer.play();
    } catch (e) {
      logger.warn(`[music] failed to play "${track.id}"`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    this.currentTrack = track;
    this.playing = true;

    if (fadeInMs > 0) {
      this.fade(0, this.effectiveVolume(), fadeInMs);
    }
  }

  /**
   * Crossfade from the current track to `track` over `durationMs`.
   * The implementation resets the queue and fades the new track in;
   * the old track's fade-out is implicit (reset() stops it immediately).
   *
   * A true two-track overlap would require TrackPlayer's queue model
   * which doesn't support simultaneous playback — the perceptual
   * crossfade is achieved via the new track's fade-in.
   */
  async crossfadeTo(track: MusicTrack, durationMs: number): Promise<void> {
    await this.init();

    if (this.currentTrack?.id === track.id && this.playing) return;

    // Cancel in-flight fades — there is a single volume knob, and a
    // pending stop()/crossfade fade fighting this one would produce a
    // garbled volume ramp (or kill the new track via a stale reset).
    this.cancelFades();

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: track.url,
        title: track.title ?? track.id,
        artist: track.artist ?? 'Olympian OST',
      });
      await TrackPlayer.setVolume(0);
      await TrackPlayer.play();
    } catch (e) {
      logger.warn(`[music] crossfadeTo "${track.id}" failed`, e);
      this.callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    this.currentTrack = track;
    this.playing = true;
    this.fade(0, this.effectiveVolume(), Math.max(0, durationMs));
  }

  /** Stop the current track, optionally fading out. */
  async stop(fadeOutMs?: number): Promise<void> {
    if (fadeOutMs && fadeOutMs > 0 && this.playing) {
      this.fade(this.effectiveVolume(), 0, fadeOutMs, async () => {
        await this.resetInternal();
      });
      return;
    }
    this.cancelFades();
    await this.resetInternal();
  }

  /** Pause playback. State retained so resume() can pick up. */
  async pause(): Promise<void> {
    try {
      await TrackPlayer.pause();
    } catch (e) {
      logger.warn('[music] pause failed', e);
    }
    this.playing = false;
  }

  /** Resume from pause. */
  async resume(): Promise<void> {
    try {
      await TrackPlayer.play();
      this.playing = true;
    } catch (e) {
      logger.warn('[music] resume failed', e);
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

  /** Tear down: stop all fades, reset TrackPlayer. Safe to call repeatedly. */
  async destroy(): Promise<void> {
    this.cancelFades();
    try {
      await TrackPlayer.reset();
    } catch {
      /* ignore */
    }
    this.currentTrack = null;
    this.playing = false;
  }

  // -- internal helpers -----------------------------------------------------

  private effectiveVolume(): number {
    return clamp(this.masterVolume * this.duckFactor, 0, 1);
  }

  private applyVolume(): void {
    TrackPlayer.setVolume(this.effectiveVolume()).catch((e: unknown) => {
      logger.warn('[music] setVolume failed', e);
    });
  }

  private async resetInternal(): Promise<void> {
    try {
      await TrackPlayer.reset();
    } catch (e) {
      logger.warn('[music] reset failed', e);
    }
    this.currentTrack = null;
    this.playing = false;
  }

  /**
   * Animate TrackPlayer volume from `from` to `to` over `ms`.
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
    // two timers never fight over `TrackPlayer.setVolume` per frame.
    this.cancelFades();
    const steps = Math.max(1, Math.ceil(ms / FADE_STEP_MS));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const t = clamp(i / steps, 0, 1);
      const v = clamp(from + (to - from) * t, 0, 1);
      TrackPlayer.setVolume(v).catch(() => {
        /* ignore transient errors during fade */
      });
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
