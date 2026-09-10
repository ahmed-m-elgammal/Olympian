import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/ui/composed/Toast';

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * App-level providers.
 *
 * `<GestureHandlerRootView>` wraps the tree because react-native-gesture-handler
 * v2 requires a root detector view — without it, gestures (the
 * virtual joystick, future swipe controls) never activate on device.
 *
 * `<ToastHost />` mounts as the LAST child of the tree so it paints above
 * every screen. It subscribes to the module-level toast queue (see
 * `@/ui/composed/Toast`) — without a mounted host, `toast()` calls from
 * anywhere in the app (screens, systems, save manager) emit into the void
 * and are silently dropped.
 */
export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.fill}>
        {children}
        <ToastHost />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

