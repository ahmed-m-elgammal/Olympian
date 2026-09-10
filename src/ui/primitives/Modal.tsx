/**
 * `<Modal>` primitive — centered overlay with backdrop.
 *
 * Spec reference: 05 §3.6 (Modal), task P1.E3.T8.
 *
 * Renders `children` inside a {@link Portal} (which uses RN's `<Modal>`).
 * The screen is darkened by a translucent backdrop; tapping the backdrop
 * calls `onClose`.
 *
 * The content itself is centered horizontally and vertically inside a
 * rounded, padded surface. Callers can override the surface padding via
 * the `padding` prop.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  colors,
  resolveRadius,
  sizing,
  spacing,
  zIndex,
  type RadiusKey,
  type SpacingKey,
} from '@/ui/theme';
import { Portal } from '@/ui/primitives/Portal';

/** Props accepted by {@link Modal}. */
export interface ModalProps {
  /** Whether the modal is currently visible. */
  visible: boolean;
  /** Called when the user dismisses the modal (backdrop tap or back button). */
  onClose: () => void;
  /** Content to render inside the modal surface. */
  children: React.ReactNode;
  /** Padding inside the surface. Default `'lg'` (16px). */
  padding?: SpacingKey;
  /** Surface corner radius token. Default `'lg'` (16px). */
  radius?: RadiusKey;
  /** Disable backdrop-tap-to-close (e.g., for required dialogs). */
  disableBackdropClose?: boolean;
  /** Test ID. */
  testID?: string;
}

/**
 * Render a centered modal overlay with a translucent backdrop. Tapping the
 * backdrop calls `onClose` unless `disableBackdropClose` is set.
 */
export function Modal({
  visible,
  onClose,
  children,
  padding = 'lg',
  radius = 'lg',
  disableBackdropClose = false,
  testID,
}: ModalProps): React.JSX.Element | null {
  return (
    <Portal visible={visible} testID={testID}>
      {/* Backdrop — fills the screen, intercepts taps. */}
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (!disableBackdropClose) {
            onClose();
          }
        }}
        accessibilityLabel="modal-backdrop"
        accessibilityRole="button"
      />

      {/* Content surface — centered on top of the backdrop. */}
      <View style={styles.centerer} pointerEvents="box-none">
        <View
          style={[
            styles.surface,
            {
              padding: spacing[padding],
              borderRadius: resolveRadius(radius),
            },
          ]}
        >
          {children}
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay50,
    zIndex: zIndex.modal,
  },
  centerer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.modal + 1,
  },
  surface: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: sizing.borderWidth,
    maxWidth: '90%',
  },
});
