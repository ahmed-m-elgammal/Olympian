/**
 * `OverworldScreen` — the playable demo-glade world (spec 06 §2.7,
 * tasks P2.E1.T8/T9 acceptance surface).
 *
 * Wiring per spec 07 (dataflow):
 *
 *   Joystick ──▶ inputStore ──▶ InputSystem ──▶ MovementSystem ──▶ ECS
 *   GameLoop ──▶ GameWorld.render() ──▶ renderBus ──▶ DrawListRenderer
 *
 * The screen owns lifecycle only:
 *  - builds the scene once per mount;
 *  - feeds the camera its viewport from the canvas layout;
 *  - drives a fixed-timestep {@link GameLoop};
 *  - pauses on app background, releases input + bus on unmount.
 *
 * @packageDocumentation
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInputStore } from '@/data/stores/inputStore';
import { useRenderBus } from '@/data/stores/renderBus';
import { GameLoop } from '@/game/engine/loop/GameLoop';
import { DrawListRenderer } from '@/game/render/canvas/DrawListRenderer';
import { GameCanvas, type CanvasViewport } from '@/game/render/canvas/GameCanvas';
import { createDemoGladeScene, type DemoGladeScene } from '@/game/scenes';
import { useRTL } from '@/ui/navigation/rtlHooks';
import { Joystick } from '@/ui/composed';
import { Button } from '@/ui/primitives/Button';
import { colors, spacing } from '@/ui/theme';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link OverworldScreen}. */
export type OverworldScreenProps = RootStackScreenProps<'Overworld'>;

/**
 * The demo-glade play screen: full-bleed Skia canvas, a back affordance
 * in the safe area, and the virtual joystick docked bottom-left.
 */
export function OverworldScreen({ navigation }: OverworldScreenProps): React.JSX.Element {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const rtl = useRTL();

  // The scene is engine-only data — create it lazily once per mount.
  // React state would force pointless re-renders; a ref keeps identity.
  const sceneRef = useRef<DemoGladeScene | null>(null);
  if (sceneRef.current === null) {
    sceneRef.current = createDemoGladeScene();
  }
  const scene = sceneRef.current;

  const loopRef = useRef<GameLoop | null>(null);

  // Run the loop while mounted; on teardown stop it, drop any stuck
  // input, and clear the mailbox so the next scene starts clean.
  useEffect(() => {
    const loop = new GameLoop(scene.gameWorld);
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      loopRef.current = null;
      useInputStore.getState().clearMove();
      useInputStore.getState().setPointerDown(false);
      useRenderBus.getState().reset();
    };
  }, [scene]);

  // Pause the simulation when the app leaves the foreground; the rAF
  // keeps running so resume is instant (GameLoop.setPaused contract).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      loopRef.current?.setPaused(state !== 'active');
    });
    return () => sub.remove();
  }, []);

  // Canvas layout → camera viewport (the camera clamps follow + culling
  // to this size; zoom comes from the scene's GAME_ZOOM).
  const handleCanvasLayout = useCallback(
    (viewport: CanvasViewport) => {
      scene.camera.setViewport(viewport.width, viewport.height);
    },
    [scene],
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.screen} testID="overworld-screen">
      <GameCanvas onLayout={handleCanvasLayout} style={styles.canvas}>
        <DrawListRenderer />
      </GameCanvas>

      {/* HUD hugs the reading-flow start edge (flips in RTL); the game
          canvas itself is never mirrored. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.hud,
          rtl && styles.hudRtl,
          {
            top: insets.top + spacing.sm,
            left: (rtl ? insets.right : insets.left) + spacing.sm,
            right: (rtl ? insets.left : insets.right) + spacing.sm,
          },
        ]}
      >
        <Button
          label={t('back')}
          icon="back"
          variant="ghost"
          size="small"
          onPress={handleBack}
          testID="overworld-back"
        />
      </View>

      <View
        pointerEvents="box-none"
        style={[
          styles.joystickDock,
          {
            bottom: insets.bottom,
            left: insets.left,
          },
        ]}
      >
        <Joystick />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hud: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  hudRtl: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-end',
  },
  joystickDock: {
    position: 'absolute',
  },
});

export default OverworldScreen;
