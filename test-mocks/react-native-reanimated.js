const React = require('react');
const {
  FlatList,
  Image,
  ScrollView,
  SectionList,
  Text,
  View,
} = require('react-native');

const Animated = {
  FlatList,
  Image,
  ScrollView,
  SectionList,
  Text,
  View,
  createAnimatedComponent: (Component) => Component,
};

function useSharedValue(initialValue) {
  const ref = React.useRef({ value: initialValue });
  return ref.current;
}

function useAnimatedStyle(updater) {
  return updater();
}

function useAnimatedProps(updater) {
  return updater();
}

function useDerivedValue(updater) {
  return useSharedValue(updater());
}

function useAnimatedRef() {
  return React.useRef(null);
}

function runOnJS(callback) {
  return (...args) => callback(...args);
}

function runOnUI(callback) {
  return (...args) => callback(...args);
}

const identity = (value) => value;
const linear = (value) => value;

const Easing = {
  bezier: () => linear,
  cubic: linear,
  ease: linear,
  in: identity,
  inOut: identity,
  linear,
  out: identity,
};

module.exports = {
  __esModule: true,
  ...Animated,
  default: Animated,
  Easing,
  cancelAnimation: jest.fn(),
  defineAnimation: identity,
  interpolate: (value) => value,
  runOnJS,
  runOnUI,
  setUpTests: jest.fn(),
  useAnimatedProps,
  useAnimatedReaction: jest.fn(),
  useAnimatedRef,
  useAnimatedScrollHandler: jest.fn(() => jest.fn()),
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay: (_duration, animation) => animation,
  withDecay: identity,
  withRepeat: identity,
  withSequence: (...animations) => animations[animations.length - 1],
  withSpring: identity,
  withTiming: identity,
};
