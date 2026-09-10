/**
 * `LevelScreen` — a single puzzle room (spec 06 §2.8, P2.E2.T7).
 *
 * P2.E2 ships the room **shell**: the hero walks the authored room map,
 * the exit portal focuses when reached, and tapping it (or the HUD
 * exit) returns to the overworld — the AC's "returning exits to the
 * overworld". The Reflex mechanic that fills the marble grid arrives
 * with P2.E3; the HUD is structured so the puzzle UI slots in without
 * reshaping the screen.
 *
 * @packageDocumentation
 */

import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

import { useInteractionStore } from '@/data/stores/interactionStore';
import type { FocusedMarker } from '@/game/engine';
import {
  LEVEL_ACTS,
  LEVEL_TITLE_KEYS,
  levelSpec,
  markerTargetRoute,
} from '@/game/scenes';
import { DrawListRenderer } from '@/game/render/canvas/DrawListRenderer';
import { GameCanvas } from '@/game/render/canvas/GameCanvas';
import { useRTL } from '@/ui/navigation/rtlHooks';
import { hapticSelection } from '@/platform/haptics/haptics';
import { Joystick, MarkerPrompt } from '@/ui/composed';
import { Button } from '@/ui/primitives/Button';
import { Text } from '@/ui/primitives/Text';
import { colors, sizing, spacing } from '@/ui/theme';
import { useFieldSceneManager } from '@/ui/screens/useFieldSceneManager';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** Props accepted by {@link LevelScreen}. */
export type LevelScreenProps = RootStackScreenProps<'Level'>;

/**
 * The puzzle room: full-bleed Skia canvas, level-name HUD, exit
 * affordance, joystick, and the exit prompt when the hero reaches the
 * portal.
 */
export function LevelScreen({ route, navigation }: LevelScreenProps): React.JSX.Element {
  const { t } = useTranslation(['ui', 'acts']);
  const insets = useSafeAreaInsets();
  const rtl = useRTL();
  const isFocused = useIsFocused();

  const levelId = route.params.levelId;
  const spec = useMemo(() => levelSpec(levelId), [levelId]);
  const titleKey = LEVEL_TITLE_KEYS[levelId] ?? '';

  const exitMarker = useCallback(
    (marker: FocusedMarker) => {
      const routeTarget = markerTargetRoute(marker.kind, marker.target);
      if (routeTarget.screen !== 'Overworld') return; // rooms only exit out
      hapticSelection();
      useInteractionStore.getState().clearFocused();
      navigation.navigate('Overworld', { act: LEVEL_ACTS[levelId] ?? 0 });
    },
    [navigation, levelId],
  );

  const { handleCanvasLayout, handleCanvasTap } = useFieldSceneManager({
    spec,
    isFocused,
    onCanvasTap: exitMarker,
  });

  const focusedMarker = useInteractionStore((s) => s.focused);

  const handleExit = useCallback(() => {
    navigation.navigate('Overworld', { act: LEVEL_ACTS[levelId] ?? 0 });
  }, [navigation, levelId]);

  return (
    <View style={styles.screen} testID="level-screen">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleCanvasTap} testID="level-canvas-tap">
        <GameCanvas onLayout={handleCanvasLayout} style={styles.canvas}>
          <DrawListRenderer />
        </GameCanvas>
      </Pressable>

      {/* HUD: level title on the reading-flow start edge, exit on the
          end edge; both flip in RTL. The game canvas is never mirrored. */}
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
        <View style={[styles.title, rtl && styles.titleRtl]} pointerEvents="none">
          <Text variant="body" scale="sm" color="text" numberOfLines={1}>
            {t(titleKey)}
          </Text>
        </View>
        <Button
          label={t('level:exit')}
          icon="back"
          variant="ghost"
          size="small"
          onPress={handleExit}
          testID="level-exit"
        />
      </View>

      <MarkerPrompt
        marker={focusedMarker}
        onEnter={exitMarker}
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
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hudRtl: {
    flexDirection: 'row-reverse',
  },
  title: {
    backgroundColor: colors.surface,
    borderRadius: sizing.radiusSm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.92,
    flexShrink: 1,
  },
  titleRtl: {
    flexDirection: 'row-reverse',
  },
  joystickDock: {
    position: 'absolute',
  },
});

export default LevelScreen;
