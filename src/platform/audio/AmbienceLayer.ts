/**
 * AmbienceLayer — looping ambient bed mixer (spec 11 §3.5).
 *
 * Multiple ambient beds (e.g., wind + birds) can play simultaneously.
 * Each bed loops indefinitely using `react-native-sound`'s
 * `setNumberOfLoops(-1)`. Per-bed and master volume multipliers
 * compose multiplicatively, just like the SFX pool.
 *
 * Spec 11 §3.5 says ambience uses the same SfxPool under the hood with
 * loop=-1. We use a dedicated class instead because (a) ambience beds
 * are long-lived (one per active Act) and should not be recycled by the
 * short-lived SFX pool, and (b) we want per-bed volume + fade-out
 * semantics that don't fit the SFX model.
 */

import Sound from 'react-native-sound';

import { logger } from '@/shared/log';
import { clamp } from '@/shared/math';

/** Constructor options for {@link AmbienceLayer}. */
export interface AmbienceLayerOptions {
  /** Base path passed to `new Sound(file, basePath, cb)`. */
  basePath?: string;
  /** Initial master volume (0..1). Default 0.6 per spec 11 §6. */
  initialMasterVolume?: number;
}

/** A single active looping ambient bed. */
interface BedEntry {
  bedId: string;
  sound: Sound;
  /** Per-bed volume multiplier (0..1). */
  volume: number;
  /** True if the underlying Sound failed to load. */
  loadError: boolean;
  /** Active fade timer (if any) so we can cancel on a re-play. */
  fadeTimer: ReturnType<typeof setInterval> | null;
}

const FADE_STEP_MS = 16;

/**
 * Looping ambient bed mixer. Use the exported {@link ambienceLayer}
 * singleton, or instantiate directly in tests.
 */
export class AmbienceLayer {
  private readonly beds: Map<string, BedEntry> = new Map();
  private masterVolume: number;
  private readonly basePath: string;

  constructor(opts: AmbienceLayerOptions = {}) {
    this.masterVolume = clamp(opts.initialMasterVolume ?? 0.6, 0, 1);
    this.basePath = opts.basePath ?? Sound.MAIN_BUNDLE;
  }

  /**
   * Start a looping ambient bed. If `bedId` is already active, the
   * existing bed is stopped (immediately, no fade) and replaced.
   *
   * Resolves even when the underlying Sound fails to load — a loadError
   * is recorded and subsequent `setVolume` calls are no-ops on it.
   */
  play(bedId: string, file: string): Promise<void> {
    // Replace any existing bed with the same id.
    if (this.beds.has(bedId)) {
      this.stopSync(bedId);
    }

    return new Promise<void>((resolve) => {
      let constructed: Sound;
      try {
        constructed = new Sound(file, this.basePath, (err: unknown) => {
          // Re-lookup by id AND verify sound identity: if play(bedId) was
          // called again while this load was in flight, `beds.get(bedId)`
          // now points at the NEWER entry. Playing `constructed` here
          // would double up the audio and leak the newer Sound.
          const entry = this.beds.get(bedId);
          if (!entry || entry.sound !== constructed) {
            // Stale load — this sound was replaced or stopped before it
            // finished loading. Release it; never touch the newer entry.
            try {
              constructed.release();
            } catch {
              /* ignore */
            }
            resolve();
            return;
          }
          if (err) {
            logger.warn(
              `[ambience] failed to load bed "${bedId}" from "${file}"`,
              err,
            );
            // Remove the dead entry (and release the sound) so callers
            // can retry play(bedId) later and isPlaying() stays truthful.
            this.beds.delete(bedId);
            try {
              constructed.release();
            } catch {
              /* ignore */
            }
            resolve();
            return;
          }
          try {
            entry.sound.setNumberOfLoops(-1);
            entry.sound.setVolume(this.masterVolume * entry.volume);
            entry.sound.play();
          } catch (e) {
            logger.warn(`[ambience] play failed for "${bedId}"`, e);
            entry.loadError = true;
          }
          resolve();
        });
      } catch (e) {
        logger.warn(`[ambience] Sound constructor threw for "${bedId}"`, e);
        resolve();
        return;
      }

      const entry: BedEntry = {
        bedId,
        sound: constructed,
        volume: 1.0,
        loadError: false,
        fadeTimer: null,
      };
      this.beds.set(bedId, entry);
    });
  }

  /**
   * Stop one bed. If `fadeOutMs` is provided and > 0, fade the bed
   * out over that duration before stopping; otherwise stop immediately.
   */
  stop(bedId: string, fadeOutMs?: number): void {
    const entry = this.beds.get(bedId);
    if (!entry) return;
    if (fadeOutMs && fadeOutMs > 0) {
      this.fadeOutAndRelease(entry, fadeOutMs);
    } else {
      this.stopSync(bedId);
    }
  }

  /** Stop every active bed. Each bed fades out independently if requested. */
  stopAll(fadeOutMs?: number): void {
    // Snapshot ids because stop() mutates the map during fadeOut.
    const ids = Array.from(this.beds.keys());
    for (const id of ids) {
      this.stop(id, fadeOutMs);
    }
  }

  /** Set a single bed's volume multiplier (0..1). */
  setVolume(bedId: string, volume: number): void {
    const entry = this.beds.get(bedId);
    if (!entry) return;
    entry.volume = clamp(volume, 0, 1);
    if (entry.fadeTimer) return; // fade will land at correct volume
    try {
      entry.sound.setVolume(clamp(this.masterVolume * entry.volume, 0, 1));
    } catch {
      /* ignore */
    }
  }

  /** Set the master volume that affects all beds. */
  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    for (const entry of this.beds.values()) {
      if (entry.fadeTimer) continue; // fade owns volume for this bed
      try {
        entry.sound.setVolume(clamp(this.masterVolume * entry.volume, 0, 1));
      } catch {
        /* ignore */
      }
    }
  }

  /** Current master volume (0..1). */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /** True if `bedId` is currently active. */
  isPlaying(bedId: string): boolean {
    return this.beds.has(bedId);
  }

  /** Number of currently active beds. */
  activeCount(): number {
    return this.beds.size;
  }

  /** Release every bed and clear the layer. Safe to call repeatedly. */
  release(): void {
    for (const entry of this.beds.values()) {
      if (entry.fadeTimer) clearInterval(entry.fadeTimer);
      try {
        entry.sound.stop();
      } catch {
        /* ignore */
      }
      try {
        entry.sound.release();
      } catch {
        /* ignore */
      }
    }
    this.beds.clear();
  }

  // -- internal helpers -----------------------------------------------------

  private stopSync(bedId: string): void {
    const entry = this.beds.get(bedId);
    if (!entry) return;
    if (entry.fadeTimer) {
      clearInterval(entry.fadeTimer);
      entry.fadeTimer = null;
    }
    try {
      entry.sound.stop();
    } catch {
      /* ignore */
    }
    try {
      entry.sound.release();
    } catch {
      /* ignore */
    }
    this.beds.delete(bedId);
  }

  private fadeOutAndRelease(entry: BedEntry, ms: number): void {
    if (entry.fadeTimer) {
      clearInterval(entry.fadeTimer);
    }
    const startVol = clamp(this.masterVolume * entry.volume, 0, 1);
    const steps = Math.max(1, Math.ceil(ms / FADE_STEP_MS));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const t = clamp(i / steps, 0, 1);
      const v = clamp(startVol * (1 - t), 0, 1);
      try {
        entry.sound.setVolume(v);
      } catch {
        /* ignore */
      }
      if (i >= steps) {
        clearInterval(timer);
        entry.fadeTimer = null;
        this.stopSync(entry.bedId);
      }
    }, FADE_STEP_MS);
    entry.fadeTimer = timer;
  }
}

/** Singleton AmbienceLayer instance for app use. Tests should construct their own. */
export const ambienceLayer = new AmbienceLayer();
