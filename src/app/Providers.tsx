import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <SafeAreaProvider>
      {children}
    </SafeAreaProvider>
  );
}
