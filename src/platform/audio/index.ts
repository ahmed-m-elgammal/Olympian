/**
 * Audio layer public API (spec 11 §3.2).
 *
 * Exposes a single `audio` object that aggregates the four sub-systems
 * (SfxPool, MusicPlayer, AmbienceLayer, AudioMixer) plus the
 * act-aware preloader. Application code should import `audio` and never
 * touch the underlying classes directly.
 *
 * Lifecycle:
 *   await audio.init();                // idempotent, safe to call multiple times
 *   await audio.preloadForAct(1);      // warm SFX for Act 1
 *   audio.music.play({ id: 'act1_explore', url: 'music/act1_explore.ogg' });
 *   audio.sfx.play('sword_swing');
 *   audio.mixer.duck('music', 0.3, 200);   // open dialogue
 *   audio.mixer.unduck('music', 500);       // close dialogue
 */

import { logger } from '@/shared/log';

import { ambienceLayer } from './AmbienceLayer';
import { AudioMixer, mixer } from './mixer';
import { MusicPlayer, musicPlayer } from './MusicPlayer';
import { preloadAudioForAct } from './preload';
import { SfxPool, sfxPool } from './SfxPool';

/** The aggregated audio API surface. */
export interface AudioAPI {
  /** SFX pool — preloaded short sound effects. */
  sfx: SfxPool;
  /** Music player — single-track playback with crossfade. */
  music: MusicPlayer;
  /** Ambience layer — looping background beds. */
  ambience: typeof ambienceLayer;
  /** Volume group mixer with ducking + MMKV persistence. */
  mixer: AudioMixer;
  /** Preload all SFX/music/ambience assets for an Act. */
  preloadForAct: (actNumber: number) => Promise<void>;
  /**
   * Initialize all sub-systems. Idempotent — safe to call multiple times.
   * Loads persisted music/sfx volumes from MMKV and wires the mixer to
   * re-apply them on every effective-volume change.
   */
  init: () => Promise<void>;
}

/** Track whether init() has been called (it's idempotent). */
let initialized = false;

/**
 * Initialize the audio layer. Loads persisted volumes from MMKV, wires the
 * mixer's subscribers to the sub-systems, and initializes TrackPlayer.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    // Load persisted music/sfx volumes before wiring subscribers so the
    // initial notify uses persisted values, not defaults.
    mixer.loadFromStorage();

    // Wire mixer → sub-systems. Each subscriber receives the *effective*
    // volume (master × group × duckFactor) so it can apply directly.
    mixer.subscribe('music', (v) => {
      musicPlayer.setVolume(v);
    });
    mixer.subscribe('sfx', (v) => {
      sfxPool.setGroupVolume(v);
    });
    mixer.subscribe('ambience', (v) => {
      ambienceLayer.setMasterVolume(v);
    });
    // NOTE: the 'ui' group is intentionally NOT wired to sfxPool here.
    // UI sounds are played through the SFX pool, whose group volume is
    // already driven by the 'sfx' subscriber — a second subscriber writing
    // the same knob would create two competing writers whose result
    // depended on notification order (dataflow bug). The 'ui' group is not
    // user-tunable in Phase 1; when it becomes tunable, route UI sounds
    // through a dedicated pool/multiplier instead of sharing this one.
    // 'voice' group is not wired yet (no voice player in Phase 1).

    // Apply the initial effective volumes (the subscriptions above only
    // fire on change; we need a one-shot push on init).
    musicPlayer.setVolume(mixer.getEffectiveVolume('music'));
    sfxPool.setGroupVolume(mixer.getEffectiveVolume('sfx'));
    ambienceLayer.setMasterVolume(mixer.getEffectiveVolume('ambience'));

    // Initialize TrackPlayer (no-op if already set up).
    await musicPlayer.init();

    logger.info('[audio] init complete', {
      music: mixer.getGroupVolume('music'),
      sfx: mixer.getGroupVolume('sfx'),
      ambience: mixer.getGroupVolume('ambience'),
    });
  } catch (e) {
    logger.error('[audio] init failed', e);
    initialized = false;
    throw e;
  }
}

/**
 * The aggregated audio API. Import this, never the underlying classes.
 *
 *   import { audio } from '@/platform/audio';
 *   await audio.init();
 *   audio.sfx.play('sword_swing');
 */
export const audio: AudioAPI = {
  sfx: sfxPool,
  music: musicPlayer,
  ambience: ambienceLayer,
  mixer,
  preloadForAct: preloadAudioForAct,
  init: initAudio,
};

// Re-export types + singletons for advanced consumers (e.g., tests).
export { SfxPool, sfxPool } from './SfxPool';
export type { SoundInstance, SfxPlayOptions, SfxPoolOptions } from './SfxPool';
export { MusicPlayer, musicPlayer } from './MusicPlayer';
export type { MusicTrack, MusicPlayOptions, MusicPlayerCallbacks } from './MusicPlayer';
export { AmbienceLayer, ambienceLayer } from './AmbienceLayer';
export type { AmbienceLayerOptions } from './AmbienceLayer';
export { AudioMixer, mixer, VOLUME_GROUPS, DEFAULT_GROUP_VOLUMES } from './mixer';
export type { VolumeGroup, VolumeListener, AudioMixerOptions } from './mixer';
export {
  preloadAudioForAct,
  ACT_AUDIO_MANIFEST,
  getActManifest,
  musicFilePath,
  ambienceFilePath,
  sfxFilePath,
  SFX_INSTANCES_PER_SOUND,
} from './preload';
export type { ActAudioManifest } from './preload';
