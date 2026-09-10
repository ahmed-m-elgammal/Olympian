/**
 * AudioMixer — volume groups + ducking (spec 11 §3.2, §6).
 *
 * Six named volume groups compose multiplicatively:
 *
 *   effective(group) = master × group × duckFactor(group)
 *
 *  - `master` applies to all groups; changing it re-notifies every
 *    group's subscribers.
 *  - `music`, `sfx`, `ambience`, `ui`, `voice` are the named groups
 *    the rest of the app toggles via settings.
 *  - `duckFactor(group)` is a temporary multiplier (default 1) used to
 *    duck music under dialogue (e.g., 0.3) and restore it after.
 *
 * Persistence: `music` and `sfx` volumes are mirrored to MMKV so the
 * user's preference survives restarts (per spec 11 §6 + task P1.E4.T4).
 * Other groups aren't user-tunable yet — they're loaded from defaults.
 *
 * Subscribers receive the *effective* volume (after master + duck) so
 * the wired sub-systems (MusicPlayer, SfxPool, AmbienceLayer) can apply
 * it directly without recomputing.
 */

import { getSfxVolume, getMusicVolume, setSfxVolume, setMusicVolume } from '@/platform/storage/mmkv';
import { logger } from '@/shared/log';
import { clamp } from '@/shared/math';

/** All recognised volume groups. */
export const VOLUME_GROUPS = [
  'master',
  'music',
  'sfx',
  'ambience',
  'ui',
  'voice',
] as const;

/** A volume group name. */
export type VolumeGroup = (typeof VOLUME_GROUPS)[number];

/** Effective-volume change callback shape. */
export type VolumeListener = (effectiveVolume: number) => void;

/** Default volumes per group (spec 11 §6). */
export const DEFAULT_GROUP_VOLUMES: Record<VolumeGroup, number> = {
  master: 1.0,
  music: 0.8,
  sfx: 1.0,
  ambience: 0.6,
  ui: 1.0,
  voice: 1.0,
};

/** Constructor options for {@link AudioMixer}. */
export interface AudioMixerOptions {
  /** Override the initial group volumes (before MMKV load). */
  initialVolumes?: Partial<Record<VolumeGroup, number>>;
  /** Hook fired on every effective-volume change. */
  onEffectiveChange?: (group: VolumeGroup, effective: number) => void;
}

const DUCK_STEP_MS = 16;

/**
 * Volume group mixer with ducking + MMKV persistence.
 * Use the exported {@link mixer} singleton, or instantiate directly in tests.
 */
export class AudioMixer {
  private readonly groupVolumes: Record<VolumeGroup, number>;
  private readonly duckFactors: Record<VolumeGroup, number> = {
    master: 1,
    music: 1,
    sfx: 1,
    ambience: 1,
    ui: 1,
    voice: 1,
  };
  /** Active duck animation timers keyed by group. */
  private readonly duckAnims = new Map<VolumeGroup, ReturnType<typeof setInterval>>();
  private readonly subscribers = new Map<VolumeGroup, Set<VolumeListener>>();
  private readonly onEffectiveChange?: (group: VolumeGroup, effective: number) => void;

  constructor(opts: AudioMixerOptions = {}) {
    // Copy defaults so the caller can't mutate DEFAULT_GROUP_VOLUMES.
    this.groupVolumes = { ...DEFAULT_GROUP_VOLUMES };
    if (opts.initialVolumes) {
      for (const key of Object.keys(opts.initialVolumes) as VolumeGroup[]) {
        const v = opts.initialVolumes[key];
        if (v !== undefined) this.groupVolumes[key] = clamp(v, 0, 1);
      }
    }
    this.onEffectiveChange = opts.onEffectiveChange;
  }

  /** Set a group's volume (0..1). Persists music/sfx to MMKV. */
  setGroupVolume(group: string, volume: number): void {
    if (!this.isGroup(group)) return;
    const v = clamp(volume, 0, 1);
    this.groupVolumes[group] = v;
    this.persistGroup(group, v);
    this.notify(group);
    // Master multiplies into every group's effective — fan out.
    if (group === 'master') {
      for (const g of VOLUME_GROUPS) {
        if (g !== 'master') this.notify(g);
      }
    }
  }

  /** Get a group's set volume (0..1, before master & duck). */
  getGroupVolume(group: string): number {
    if (!this.isGroup(group)) return 0;
    return this.groupVolumes[group];
  }

  /**
   * Compute effective output for a group:
   *   master × group × duckFactor
   * For the master group itself, master × duckFactor (no self-multiply).
   */
  getEffectiveVolume(group: string): number {
    if (!this.isGroup(group)) return 0;
    if (group === 'master') {
      return clamp(this.groupVolumes.master * this.duckFactors.master, 0, 1);
    }
    return clamp(
      this.groupVolumes.master *
        this.groupVolumes[group] *
        this.duckFactors[group],
      0,
      1,
    );
  }

  /**
   * Temporarily duck a group's volume to `targetVolume` over `durationMs`.
   * The duck factor is a multiplier on the set volume — e.g.,
   * `duck('music', 0.3, 200)` drops music to 30% over 200ms.
   * While ducked, `getEffectiveVolume('music')` reflects the duck.
   */
  duck(group: string, targetVolume: number, durationMs: number): void {
    if (!this.isGroup(group)) return;
    const target = clamp(targetVolume, 0, 1);
    this.animateDuck(group, target, Math.max(0, durationMs));
  }

  /**
   * Restore a group's duck factor to 1 over `durationMs`.
   * No-op if the group isn't currently ducked.
   */
  unduck(group: string, durationMs: number): void {
    if (!this.isGroup(group)) return;
    this.animateDuck(group, 1, Math.max(0, durationMs));
  }

  /**
   * Subscribe to effective-volume changes for a group.
   * Returns an unsubscribe function.
   */
  subscribe(group: string, callback: VolumeListener): () => void {
    if (!this.isGroup(group)) return () => undefined;
    let set = this.subscribers.get(group);
    if (!set) {
      set = new Set();
      this.subscribers.set(group, set);
    }
    set.add(callback);
    return () => {
      this.subscribers.get(group)?.delete(callback);
    };
  }

  /** Load persisted music/sfx volumes from MMKV. Safe to call repeatedly. */
  loadFromStorage(): void {
    try {
      this.groupVolumes.music = getMusicVolume(DEFAULT_GROUP_VOLUMES.music);
    } catch (e) {
      logger.warn('[mixer] failed to load music volume', e);
    }
    try {
      this.groupVolumes.sfx = getSfxVolume(DEFAULT_GROUP_VOLUMES.sfx);
    } catch (e) {
      logger.warn('[mixer] failed to load sfx volume', e);
    }
    // Notify so wired sub-systems pick up the loaded values.
    this.notify('music');
    this.notify('sfx');
  }

  /** Release timers; safe to call from test teardown. */
  destroy(): void {
    for (const t of this.duckAnims.values()) clearInterval(t);
    this.duckAnims.clear();
    this.subscribers.clear();
  }

  // -- internal helpers -----------------------------------------------------

  private isGroup(g: string): g is VolumeGroup {
    return (VOLUME_GROUPS as readonly string[]).includes(g);
  }

  private persistGroup(group: VolumeGroup, v: number): void {
    try {
      if (group === 'music') {
        setMusicVolume(v);
      } else if (group === 'sfx') {
        setSfxVolume(v);
      }
      // Other groups aren't persisted per task P1.E4.T4.
    } catch (e) {
      logger.warn(`[mixer] persist failed for ${group}`, e);
    }
  }

  /**
   * Animate a group's duck factor from its current value to `target`
   * over `ms`. Notifies subscribers on every step so wired sub-systems
   * apply the changing volume smoothly.
   */
  private animateDuck(group: VolumeGroup, target: number, ms: number): void {
    // Cancel any in-flight duck animation for this group.
    const existing = this.duckAnims.get(group);
    if (existing) clearInterval(existing);

    if (ms <= 0) {
      this.duckFactors[group] = target;
      this.notify(group);
      return;
    }

    const from = this.duckFactors[group];
    const steps = Math.max(1, Math.ceil(ms / DUCK_STEP_MS));
    let i = 0;
    // Fire an immediate step at t=0 so subscribers don't wait 16ms for the
    // first volume change (the wired sub-systems should duck without delay).
    this.duckFactors[group] = clamp(from + (target - from) * (1 / steps), 0, 1);
    this.notify(group);
    const timer = setInterval(() => {
      i++;
      const t = clamp(i / steps, 0, 1);
      this.duckFactors[group] = clamp(from + (target - from) * t, 0, 1);
      this.notify(group);
      if (i >= steps) {
        clearInterval(timer);
        this.duckAnims.delete(group);
        this.duckFactors[group] = target;
        this.notify(group);
      }
    }, DUCK_STEP_MS);
    this.duckAnims.set(group, timer);
  }

  private notify(group: VolumeGroup): void {
    const effective = this.getEffectiveVolume(group);
    try {
      this.onEffectiveChange?.(group, effective);
    } catch (e) {
      logger.warn(`[mixer] onEffectiveChange threw for ${group}`, e);
    }
    const set = this.subscribers.get(group);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(effective);
      } catch (e) {
        logger.warn(`[mixer] subscriber threw for ${group}`, e);
      }
    }
  }
}

/** Singleton AudioMixer instance for app use. Tests should construct their own. */
export const mixer = new AudioMixer();
