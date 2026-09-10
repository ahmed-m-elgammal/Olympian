import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function RootNavigator(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Olympian</Text>
      <Text style={styles.subtitle}>Greek Mythology RPG & Puzzle</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0f1d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e2d3a8',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#8da0b6',
    marginTop: 8,
  },
});
