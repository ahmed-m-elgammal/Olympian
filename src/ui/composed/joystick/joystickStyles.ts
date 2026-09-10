/**
 * Joystick visual styles — built once from design tokens + the gameplay
 * control constants (spec 07 §4.1). No hardcoded colors or dimensions:
 * sizes come from `@/game/config/gameplay` (the single home of control
 * tuning), colors/spacing/borders/shadows from `@/ui/theme` tokens.
 *
 * @packageDocumentation
 */

import { StyleSheet } from 'react-native';

import {
  JOYSTICK_KNOB_DIAMETER,
  JOYSTICK_TOUCH_BOX,
  JOYSTICK_VISUAL_DIAMETER,
} from '@/game/config/gameplay';
import { colors, shadows, sizing, spacing } from '@/ui/theme';

/** Knob centering offset inside the base ((base − knob) / 2). */
export const KNOB_REST_OFFSET =
  (JOYSTICK_VISUAL_DIAMETER - JOYSTICK_KNOB_DIAMETER) / 2;

export const joystickStyles = StyleSheet.create({
  /** Touch capture area — larger than the visuals for forgiving grabs. */
  touchArea: {
    width: JOYSTICK_TOUCH_BOX,
    height: JOYSTICK_TOUCH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Base ring the knob travels within. */
  base: {
    width: JOYSTICK_VISUAL_DIAMETER,
    height: JOYSTICK_VISUAL_DIAMETER,
    borderRadius: JOYSTICK_VISUAL_DIAMETER / 2,
    backgroundColor: colors.overlay50,
    borderColor: colors.borderStrong,
    borderWidth: sizing.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Thumb cap. */
  knob: {
    position: 'absolute',
    left: KNOB_REST_OFFSET,
    top: KNOB_REST_OFFSET,
    width: JOYSTICK_KNOB_DIAMETER,
    height: JOYSTICK_KNOB_DIAMETER,
    borderRadius: JOYSTICK_KNOB_DIAMETER / 2,
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
    borderWidth: sizing.borderWidthFocus,
    ...shadows[2],
  },
  /** Outer margin used by the screen that mounts the joystick. */
  margin: {
    margin: spacing.lg,
  },
});
