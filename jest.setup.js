/* eslint-env jest */
// Mock react-native-reanimated
try {
  require('react-native-reanimated').setUpTests();
} catch (e) {
  // Reanimated may not be loaded during basic unit tests
}
