import React from 'react';
import { StatusBar } from 'react-native';
import { Providers } from './Providers';
import { RootNavigator } from './RootNavigator';

export function App(): React.JSX.Element {
  return (
    <Providers>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </Providers>
  );
}

export default App;
