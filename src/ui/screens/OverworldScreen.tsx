/**
 * `OverworldScreen` — the Act overworld: top-down tile map of the
 * current Act with walk-to-enter markers (spec 06 §2.7, tasks
 * P2.E2.T3–T5 acceptance surface).
 *
 * Wiring per spec 07 (dataflow):
 *
 *   Joystick ──▶ inputStore ──▶ InputSystem ──▶ MovementSystem ──▶ ECS
 *   MarkerSystem ──▶ interactionStore ──▶ MarkerPrompt ──▶ navigation
 *   SceneManager ──▶ renderBus ──▶ DrawListRenderer
 *
 * The screen owns lifecycle only (via {@link useFieldSceneManager}) and
 * the two entry decisions: tap the canvas or the prompt while a marker
 * is focused. Exits: → `Level` (puzzle marker), → `Hub` (portal marker
 * or the HUD back button); the boss marker toasts until P2.E4.
 *
 * @packageDocumentation
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

import { useInteractionStore } from '@/data/stores/interactionStore';
import type { FocusedMarker } from '@/game/engine';
import {
  markerTargetRoute,
  overworldSpecForAct,
} from '@/game/scenes';
import { DrawListRenderer } from '@/game/render/canvas/DrawListRenderer';
import { GameCanvas } from '@/game/render/canvas/GameCanvas';
import { useRTL } from '@/ui/navigation/rtlHooks';
import { hapticLight, hapticSelection } from '@/platform/haptics/haptics';
import { Joystick, MarkerPrompt, toast } from '@/ui/composed';
import { Button } from '@/ui/primitives/Button';
import { colors, spacing } from '@/ui/theme';
import { useFieldSceneManager } from '@/ui/screens/useFieldSceneManager';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link OverworldScreen}. */
export type OverworldScreenProps = RootStackScreenProps<'Overworld'>;

/**
 * The Act 1 overworld: full-bleed Skia canvas, HUD back affordance, the
 * virtual joystick docked bottom-left, and the enter prompt when the
 * hero stands on a marker.
 */
export function OverworldScreen({ route, navigation }: OverworldScreenProps): React.JSX.Element {
  const { t } = useTranslation('ui');
  const insets = useSafeAreaInsets();
  const rtl = useRTL();
  const isFocused = useIsFocused();

  const spec = useMemo(() => overworldSpecForAct(route.params.act), [route.params.act]);

  // Enter the focused marker: puzzle → Level, portal → Hub, boss → toast
  // until the BossScreen exists (P2.E4).
  const enterMarker = useCallback(
    (marker: FocusedMarker) => {
      hapticSelection();
      useInteractionStore.getState().clearFocused();
      const routeTarget = markerTargetRoute(marker.kind, marker.target);
      switch (routeTarget.screen) {
        case 'Level':
          navigation.navigate('Level', { levelId: routeTarget.levelId });
          break;
        case 'Hub':
          navigation.navigate('Hub');
          break;
        case 'Overworld':
          navigation.navigate('Overworld', { act: route.params.act });
          break;
        case 'Boss':
          toast(t('overworld.boss_locked'), { variant: 'warning' });
          break;
      }
    },
    [navigation, route.params.act, t],
  );

  const { handleCanvasLayout, handleCanvasTap } = useFieldSceneManager({
    spec,
    isFocused,
    onCanvasTap: enterMarker,
  });

  // Subtle tick when the prompt appears/disappears (you can enter now).
  const focusedMarker = useInteractionStore((s) => s.focused);
  useEffect(() => {
    if (focusedMarker) {
      hapticLight();
    }
  }, [focusedMarker]);

  const handleBack = useCallback(() => {
    navigation.navigate('Hub');
  }, [navigation]);

  return (
    <View style={styles.screen} testID="overworld-screen">
      {/* The canvas doubles as the tap-to-enter surface (spec 01 §3.1);
          the joystick + HUD are absolute siblings and win their touches. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleCanvasTap} testID="overworld-canvas-tap">
        <GameCanvas onLayout={handleCanvasLayout} style={styles.canvas}>
          <DrawListRenderer />
        </GameCanvas>
      </Pressable>

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
          label={t('overworld.to_hub')}
          icon="back"
          variant="ghost"
          size="small"
          onPress={handleBack}
          testID="overworld-back"
        />
      </View>

      <MarkerPrompt
        marker={focusedMarker}
        onEnter={enterMarker}
        bottomOffset={insets.bottom + PROMPT_LIFT}
      />

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

/** Gap between the prompt chip and the joystick dock baseline. */
const PROMPT_LIFT = 132;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  canvas: {
    flex: 1,
  },
  hud: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: spacing.sm,
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
