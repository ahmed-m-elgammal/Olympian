/**
 * Barrel export for composed components.
 *
 * Import from `@/ui/composed` (this file):
 *
 * ```ts
 * import { Card, ListItem, TabBar, ToastHost, toast, StatBar } from '@/ui/composed';
 * ```
 */

export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';

export { ListItem } from './ListItem';
export type { ListItemProps } from './ListItem';

export { TabBar } from './TabBar';
export type { TabBarProps, TabDef } from './TabBar';

export {
  ToastHost,
  toast,
  dismissToast,
  subscribeToToasts,
  clearToasts,
} from './Toast';
export type { ToastHostProps, ToastEntry, ToastVariant } from './Toast';

export { StatBar } from './StatBar';
export type { StatBarProps } from './StatBar';

export { Joystick } from './joystick/Joystick';
export { intentFromKnob, clampKnob } from './joystick/joystickMath';
export type { Vec2 } from './joystick/joystickMath';

export { MarkerPrompt } from './MarkerPrompt';
export type { MarkerPromptProps } from './MarkerPrompt';
