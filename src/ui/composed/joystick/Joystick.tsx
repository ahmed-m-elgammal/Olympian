/**
 * `<Joystick>` — virtual analog stick, bottom-left (spec 07 §4.1,
 * task P2.E1.T8).
 *
 * Gesture flow (Reanimated, UI-thread worklets):
 *
 *   touch → Pan gesture tracks the finger → knob translation is
 *   clamped to the rim on the UI thread → the raw displacement is
 *   shipped to the JS thread (`runOnJS`) where it becomes the analog
 *   intent via `intentFromKnob` and is published to `inputStore`.
 *
 * `inputStore` is the **only** channel into the simulation: the
 * `InputSystem` copies the vector into `MoveIntent` components once
 * per tick — this component never talks to the engine directly
 * (spec 07 §4.1 dataflow boundary).
 *
 * Positioning: the game canvas is not mirrored in RTL, so the stick
 * stays bottom-left regardless of locale (one-handed/mirrored modes
 * are P4.E4.T5 and will relocate it explicitly).
 *
 * @packageDocumentation
 */

import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useInputStore } from '@/data/stores/inputStore';
import {
  JOYSTICK_DEADZONE_PX,
  JOYSTICK_RADIUS,
} from '@/game/config/gameplay';
import { durations } from '@/ui/theme';

import { clampKnob, intentFromKnob } from './joystickMath';
import { joystickStyles } from './joystickStyles';

// ---------------------------------------------------------------------------
// JS-thread publishers (stable module-level identity for `runOnJS`)
// ---------------------------------------------------------------------------

/** Convert a raw displacement to the analog intent and publish it. */
function publishMove(rawX: number, rawY: number): void {
  const intent = intentFromKnob(
    rawX,
    rawY,
    JOYSTICK_RADIUS,
    JOYSTICK_DEADZONE_PX,
  );
  useInputStore.getState().setMove(intent.x, intent.y);
}

/** Publish pointer-down (drives HUD affordances). */
function publishPress(): void {
  useInputStore.getState().setPointerDown(true);
}

/** Zero the vector + pointer state (finger lifted / gesture cancelled). */
function publishRelease(): void {
  const input = useInputStore.getState();
  input.clearMove();
  input.setPointerDown(false);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Virtual analog stick. Mount it above the game canvas (absolute
 * positioned by the caller); it renders a 200×200 touch area with the
 * 100px base ring and 44px thumb cap centered inside.
 */
export function Joystick(): React.JSX.Element {
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const press = useSharedValue(0);

  // If the gesture is interrupted by unmount (e.g. back navigation
  // mid-drag), the store must not keep a stale deflection.
  useEffect(() => {
    return () => publishRelease();
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onBegin(() => {
          press.value = withTiming(1, { duration: durations.fast });
          runOnJS(publishPress)();
        })
        .onUpdate((e) => {
          const knob = clampKnob(e.translationX, e.translationY, JOYSTICK_RADIUS);
          knobX.value = knob.x;
          knobY.value = knob.y;
          runOnJS(publishMove)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          knobX.value = withTiming(0, { duration: durations.fast });
          knobY.value = withTiming(0, { duration: durations.fast });
          press.value = withTiming(0, { duration: durations.fast });
          runOnJS(publishRelease)();
        }),
    [knobX, knobY, press],
  );

  // Knob tracks the (UI-thread) shared values; the cap swells slightly
  // while held for tactile feedback.
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: knobX.value },
      { translateY: knobY.value },
      { scale: 1 + press.value * 0.06 },
    ],
  }));

  // Reanimated's `Animated.View` style prop type triggers TS2589 with
  // non-trivial animated styles — same simplification as `<Button>`.
  const AnimatedView = Animated.View as unknown as React.FC<{
    style?: object;
    children?: React.ReactNode;
  }>;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={joystickStyles.touchArea}
        testID="joystick"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="box-only"
      >
        <View style={joystickStyles.base}>
          <AnimatedView style={[joystickStyles.knob, knobStyle]} />
        </View>
      </View>
    </GestureDetector>
  );
}

export default Joystick;
