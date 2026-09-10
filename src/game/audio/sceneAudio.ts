/**
 * Scene audio bridge — adapts the engine's {@link SceneAudioBridge} to
 * the platform audio layer (spec 07 §5 step 6, spec 11 §3/§4).
 *
 *  - Music: `crossfadeTo` when the track actually changes (the player
 *    no-ops on the same id, so overworld → level with a shared track
 *    never restarts the theme).
 *  - Ambience: one bed slot (`SCENE_BED_ID`) swapped per scene; fade it
 *    out on scene exit. Music deliberately keeps floating across scenes
 *    per spec 11 (only scenes with explicit music swap it).
 *
 * All calls are fire-and-forget with logged failures — a missing audio
 * file must never block or crash a scene load.
 *
 * @packageDocumentation
 */

import {
  ambienceLayer,
  ambienceFilePath,
  audio,
  musicFilePath,
} from '@/platform/audio';
import { logger } from '@/shared/log';

import {
  SCENE_AMBIENCE_FADE_MS,
  SCENE_MUSIC_CROSSFADE_MS,
} from '@/game/config/gameplay';
import type { SceneAudioBridge } from '@/game/engine/scene/types';

/** The single ambience bed slot owned by scene transitions. */
export const SCENE_BED_ID = 'scene';

/** ids currently applied (so exits only fade what we started). */
let activeAmbience: string | null = null;

/** Production {@link SceneAudioBridge} over the platform audio layer. */
export const sceneAudioBridge: SceneAudioBridge = {
  enter(music, ambience) {
    audio.music
      .crossfadeTo({ id: music, url: musicFilePath(music) }, SCENE_MUSIC_CROSSFADE_MS)
      .catch((e: unknown) => {
        logger.warn(`[sceneAudio] music crossfade to "${music}" failed`, e);
      });

    if (ambience && ambience !== activeAmbience) {
      activeAmbience = ambience;
      ambienceLayer.play(SCENE_BED_ID, ambienceFilePath(ambience)).catch((e: unknown) => {
        logger.warn(`[sceneAudio] ambience "${ambience}" failed`, e);
      });
    } else if (!ambience && activeAmbience) {
      ambienceLayer.stop(SCENE_BED_ID, SCENE_AMBIENCE_FADE_MS);
      activeAmbience = null;
    }
  },

  exit() {
    if (activeAmbience) {
      ambienceLayer.stop(SCENE_BED_ID, SCENE_AMBIENCE_FADE_MS);
      activeAmbience = null;
    }
  },
};

export default sceneAudioBridge;
