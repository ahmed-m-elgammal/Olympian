import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/ui/composed/Toast';

export interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * App-level providers.
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
      {children}
      <ToastHost />
    </SafeAreaProvider>
  );
}
