/**
 * `useFieldSceneManager` — shared screen-side lifecycle for playable
 * field scenes (Overworld / Level; spec 06 §2.7, §2.8 + spec 07 §5).
 *
 * The hook wires exactly one {@link SceneManager} per mounted screen:
 *
 *   mount ──▶ loadScene(spec) ──▶ start
 *   nav focus ──▶ start        nav blur ──▶ stop (+ input reset)
 *   AppState ──▶ setPaused     unmount ──▶ dispose (+ bus reset)
 *
 * and owns the two screen gestures that are not the joystick:
 * canvas layout (viewport → camera) and a canvas tap (enter the
 * focused marker — spec 01 §3.1 "walk over a marker and tap").
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { inputStoreSource, useInputStore } from '@/data/stores/inputStore';
import { useRenderBus } from '@/data/stores/renderBus';
import {
  interactionFocusSink,
  useInteractionStore,
} from '@/data/stores/interactionStore';
import { sceneAudioBridge } from '@/game/audio/sceneAudio';
import { SceneManager } from '@/game/engine/scene/SceneManager';
import type { SceneSpec } from '@/game/engine/scene/types';
import type { FocusedMarker } from '@/game/engine/systems/MarkerSystem';
import {
  createFieldSceneBuilder,
  resolveTilemap,
  snapCameraTo,
} from '@/game/scenes';
import type { CanvasViewport } from '@/game/render/canvas/GameCanvas';

/** Options for {@link useFieldSceneManager}. */
export interface FieldSceneManagerOptions {
  /** The scene to load (identity change = reload). */
  readonly spec: SceneSpec;
  /** Whether the screen is navigation-focused (react-navigation). */
  readonly isFocused: boolean;
  /** Canvas tap while a marker is focused. */
  readonly onCanvasTap?: (marker: FocusedMarker) => void;
}

/** What the hook hands back to the screen. */
export interface FieldSceneManagerApi {
  /** Canvas layout → camera viewport + spawn snap. */
  readonly handleCanvasLayout: (viewport: CanvasViewport) => void;
  /** Canvas tap → enter the focused marker (when one is focused). */
  readonly handleCanvasTap: () => void;
}

/**
 * Build the field-scene builder once (module-level — it is stateless:
 * all mutable state lives inside the built scenes).
 */
const fieldSceneBuilder = createFieldSceneBuilder({
  resolveTilemap,
  focusSink: interactionFocusSink,
  inputSource: inputStoreSource,
});

export function useFieldSceneManager(
  options: FieldSceneManagerOptions,
): FieldSceneManagerApi {
  const { spec, isFocused } = options;

  // The manager is engine-only data — create it lazily once per mount.
  const managerRef = useRef<SceneManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new SceneManager({
      buildScene: fieldSceneBuilder,
      audio: sceneAudioBridge,
      resetInput: () => {
        useInputStore.getState().clearMove();
        useInputStore.getState().setPointerDown(false);
      },
    });
  }
  const manager = managerRef.current;

  const onCanvasTapRef = useRef(options.onCanvasTap);
  onCanvasTapRef.current = options.onCanvasTap;

  // ---- Scene load + loop lifecycle ---------------------------------------
  // Load ONCE per spec: the scene (and hero position) survives nav
  // focus changes — leaving to a Level and coming back must not
  // rebuild the overworld (spec 06 §7 state preservation).
  useEffect(() => {
    manager.loadScene(spec);
    manager.start();
    return () => manager.stop();
  }, [manager, spec]);

  // Focus gates the loop only (start is idempotent; stop clears input
  // so a held joystick can't leak into the covered screen).
  useEffect(() => {
    if (isFocused) {
      manager.start();
    } else {
      manager.stop();
    }
  }, [manager, isFocused]);

  // Pause the simulation when the app leaves the foreground; the rAF
  // keeps running so resume is instant (GameLoop.setPaused contract).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      manager.setPaused(state !== 'active');
    });
    return () => sub.remove();
  }, [manager]);

  // Teardown: stop everything and clear the render mailbox so the next
  // screen starts clean.
  useEffect(() => {
    const owned = manager;
    return () => {
      owned.dispose();
      useInputStore.getState().clearMove();
      useInputStore.getState().setPointerDown(false);
      useRenderBus.getState().reset();
    };
  }, [manager]);

  // ---- Canvas gestures -----------------------------------------------------
  const handleCanvasLayout = useCallback(
    (viewport: CanvasViewport) => {
      const handle = manager.scene;
      if (!handle) return;
      handle.camera.setViewport(viewport.width, viewport.height);
      // Re-snap: the builder snapped before the real viewport existed.
      snapCameraTo(
        handle.camera,
        spec.playerSpawn,
        {
          width: handle.map.getPixelWidth(),
          height: handle.map.getPixelHeight(),
        },
      );
    },
    [manager, spec],
  );

  const handleCanvasTap = useCallback(() => {
    const marker = useInteractionStore.getState().focused;
    if (marker) {
      onCanvasTapRef.current?.(marker);
    }
  }, []);

  return useMemo(
    () => ({ handleCanvasLayout, handleCanvasTap }),
    [handleCanvasLayout, handleCanvasTap],
  );
}
