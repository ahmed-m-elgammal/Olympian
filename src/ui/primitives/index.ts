/**
 * Barrel export for UI primitives.
 *
 * Import from `@/ui/primitives` (this file) instead of reaching into the
 * individual primitive files.
 *
 * ```ts
 * import { View, Text, Button, Icon, Input, Modal, Portal, ProgressBar } from '@/ui/primitives';
 * ```
 */

export { View } from './View';
export type { ViewProps } from './View';

export { Text } from './Text';
export type { TextProps, TextAlign } from './Text';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Icon, ICON_PLACEHOLDER_COLORS, getIconColor } from './Icon';
export type { IconProps, IconName, IconSize } from './Icon';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Portal } from './Portal';
export type { PortalProps } from './Portal';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';
