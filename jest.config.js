module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@shopify/react-native-skia|react-native-reanimated|react-native-gesture-handler|@react-navigation|react-native-sound|react-native-track-player|react-native-mmkv|@op-engineering/op-sqlite)/)',
  ],
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/__tests__/e2e/'],
};
