/**
 * `<Portal>` primitive — escape local z-index by rendering into a top-level
 * RN `<Modal>`.
 *
 * Spec reference: 05 §3.6 (Modal/Portal), task P1.E3.T8.
 *
 * React Native's `<Modal>` already renders into a new native window above
 * the rest of the React tree, which is the closest RN equivalent of a
 * web portal. This primitive is a thin typed wrapper around it so callers
 * can mount content above sibling overflow:hidden layers without having to
 * know RN's Modal API directly.
 *
 * `<Modal>` (in `./Modal.tsx`) composes this primitive and adds backdrop +
 * centering; most callers should use `<Modal>` instead of `<Portal>` directly.
 */

import React from 'react';
import {
  Modal as RNModal,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

import { zIndex } from '@/ui/theme';

/** Props accepted by {@link Portal}. */
export interface PortalProps {
  /** Whether the portal is currently mounted. */
  visible: boolean;
  /** Whether the modal should animate in. iOS-only; Android uses slide. */
  animated?: boolean;
  /** Children to render in the portal. */
  children: React.ReactNode;
  /** Optional style applied to the outer container. */
  style?: ViewProps['style'];
  /**
   * Android hardware-back handler. RN's `<Modal>` requires this to respond
   * to the back button — with a no-op the modal can never be dismissed by
   * the back gesture (spec 05 §3.6: "Closes on back button (Android)").
   * The composed `<Modal>` wires its `onClose` here.
   */
  onRequestClose?: () => void;
  /** Test ID. */
  testID?: string;
}

/**
 * Render `children` into a top-level RN `<Modal>` (the closest RN
 * equivalent of a portal). When `visible` is false, nothing is rendered.
 */
export function Portal({
  visible,
  animated = true,
  children,
  style,
  onRequestClose,
  testID,
}: PortalProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }
  return (
    <RNModal
      visible={visible}
      transparent
      hardwareAccelerated
      animationType={animated ? 'fade' : 'none'}
      onRequestClose={onRequestClose ?? (() => undefined)}
      testID={testID}
    >
      <View style={[styles.fill, style]}>{children}</View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    zIndex: zIndex.modal,
  },
});
