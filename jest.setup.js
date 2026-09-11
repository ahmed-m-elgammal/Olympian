/* eslint-env jest */

// 0) Set up react-native-gesture-handler's jest environment (mocks the
//    RNGestureHandlerModule TurboModule so `Providers` and any gesture
//    UI can import the library in tests). Must run before module imports.
try {
  require('react-native-gesture-handler/jestSetup');
} catch (e) {
  // Older gesture-handler versions without a dedicated setup — the
  // module-level mock below would then be required instead.
}

// 1) Use a JS-only Reanimated mock in Jest. Native JSI animation runtimes are
//    unavailable in Node, while the real package is still used by Metro.
jest.mock('react-native-reanimated', () =>
  require('./test-mocks/react-native-reanimated'),
);

// Reanimated 4 delegates its JS runtime to react-native-worklets. Use the
// package's Jest implementation so tests do not initialize the native JSI
// Worklets module.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock'),
);

try {
  require('react-native-reanimated').setUpTests();
} catch (e) {
  // Reanimated may not be loaded during basic unit tests
}

// 2) Mock native modules that don't have a JS-only fallback and crash Jest
//    on import. These mocks are intentionally minimal — they only need to
//    satisfy the `import` / `require` call sites without throwing.
//
//    Individual test files that need to assert on the behaviour of these
//    modules (e.g., `__tests__/platform/audio/sfxPool.test.ts`) install
//    their own richer mocks via `jest.mock(...)` which override these.

// react-native-sound — accesses `Platform.IsAndroid` at module load time
// (see node_modules/react-native-sound/sound.js:5). Without a mock, this
// throws "Cannot read properties of undefined (reading 'IsAndroid')" in Jest.
jest.mock('react-native-sound', () => {
  class SoundMock {
    constructor(filename, _baseDir, onComplete) {
      this._filename = filename;
      this._duration = 0;
      this._volume = 1;
      this._numberOfChannels = 1;
      // Mimic the success-callback shape
      if (typeof onComplete === 'function') {
        // Defer to next tick to mirror async native load
        setImmediate(() => onComplete(null, { duration: 0 }));
      }
    }
    play(onPlay) {
      if (typeof onPlay === 'function') setImmediate(() => onPlay(true));
      return this;
    }
    pause() {}
    stop() {}
    release() {}
    setVolume(v) {
      this._volume = v;
    }
    getDuration() {
      return this._duration;
    }
    getNumberOfChannels() {
      return this._numberOfChannels;
    }
  }
  // Static-ish helpers exposed by the real library
  SoundMock.enable = () => {};
  SoundMock.setActive = () => {};
  SoundMock.setCategory = () => {};
  SoundMock.setMode = () => {};
  SoundMock.MAIN_BUNDLE = '';
  SoundMock.DOCUMENT = '';
  SoundMock.LIBRARY = '';
  SoundMock.CACHES = '';
  return SoundMock;
});

// react-native-track-player — registers event listeners at module load
jest.mock('react-native-track-player', () => {
  const listeners = new Map();
  const TrackPlayerMock = {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    removeUpcomingTracks: jest.fn().mockResolvedValue(undefined),
    skip: jest.fn().mockResolvedValue(undefined),
    skipToNext: jest.fn().mockResolvedValue(undefined),
    skipToPrevious: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    setRate: jest.fn().mockResolvedValue(undefined),
    getVolume: jest.fn().mockResolvedValue(1),
    getRate: jest.fn().mockResolvedValue(1),
    getQueue: jest.fn().mockResolvedValue([]),
    getActiveTrackIndex: jest.fn().mockResolvedValue(null),
    getActiveTrack: jest.fn().mockResolvedValue(null),
    getProgress: jest.fn().mockResolvedValue({ position: 0, duration: 0, buffered: 0 }),
    getPlaybackState: jest.fn().mockResolvedValue({ state: 'none' }),
    addEventListener: jest.fn((event, handler) => {
      const set = listeners.get(event) || new Set();
      set.add(handler);
      listeners.set(event, set);
      return {
        remove: () => {
          const s = listeners.get(event);
          if (s) s.delete(handler);
        },
      };
    }),
    // Test helper: emit an event to registered listeners
    __emit(event, payload) {
      const set = listeners.get(event);
      if (set) for (const h of set) h(payload);
    },
    // Re-export the Event enum shape used by callers
    Event: {
      PlaybackActiveTrackChanged: 'playback-active-track-changed',
      PlaybackState: 'playback-state',
      PlaybackQueueEnded: 'playback-queue-ended',
      PlaybackError: 'playback-error',
      RemotePlayId: 'remote-play-id',
      RemotePlay: 'remote-play',
      RemotePause: 'remote-pause',
      RemoteStop: 'remote-stop',
      RemoteNext: 'remote-next',
      RemotePrevious: 'remote-previous',
      RemoteSeek: 'remote-seek',
      RemoteDuck: 'remote-duck',
    },
    State: { Playing: 'playing', Paused: 'paused', Stopped: 'stopped', Ready: 'ready' },
    Capability: {
      Play: 'play',
      Pause: 'pause',
      Stop: 'stop',
      SkipToNext: 'skipToNext',
      SkipToPrevious: 'skipToPrevious',
      SeekTo: 'seekTo',
    },
  };
  return { __esModule: true, default: TrackPlayerMock, ...TrackPlayerMock };
});

// @op-engineering/op-sqlite — JSI binding not available in Jest
jest.mock('@op-engineering/op-sqlite', () => {
  // In-memory SQL engine fallback is overkill for a global mock; we just
  // return a stub that throws on actual use. Test files that exercise
  // real SQL behaviour install their own richer mock.
  const open = jest.fn(() => ({
    execute: jest.fn(() => ({ rows: { _array: [], length: 0 } })),
    executeSync: jest.fn(() => ({ rows: { _array: [], length: 0 } })),
    transaction: jest.fn((cb) => cb?.({ execute: jest.fn(), executeSync: jest.fn() })),
    close: jest.fn(),
    deleteFile: jest.fn(),
    getDbPath: jest.fn(() => '/tmp/olympian.db'),
  }));
  const close = jest.fn();
  const removeDb = jest.fn();
  const openSync = jest.fn(() => ({
    execute: jest.fn(() => ({ rows: { _array: [], length: 0 } })),
    executeSync: jest.fn(() => ({ rows: { _array: [], length: 0 } })),
    close: jest.fn(),
  }));
  return {
    open,
    openSync,
    close,
    removeDb,
    // type re-exports only matter at compile time — runtime is irrelevant
    SQLITE_VERSION: '3.45.0',
  };
});

// react-native-mmkv — needs native storage in real app, JS Map in tests
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  class MMKVMock {
    constructor(_opts = {}) {
      // singleton — every consumer shares the same Map
    }
    getString(key) {
      return store.has(key) ? store.get(key) : undefined;
    }
    getNumber(key) {
      return store.has(key) ? Number(store.get(key)) : undefined;
    }
    getBoolean(key) {
      return store.has(key) ? store.get(key) === 'true' : undefined;
    }
    set(key, value) {
      store.set(key, String(value));
    }
    delete(key) {
      store.delete(key);
    }
    contains(key) {
      return store.has(key);
    }
    getAllKeys() {
      return Array.from(store.keys());
    }
    clearAll() {
      store.clear();
    }
    // Reload hook used by the React binding
    __internal = { copyIfSync: (v) => v };
  }
  return {
    MMKV: MMKVMock,
    useMMKVString: () => [undefined, jest.fn()],
    useMMKVNumber: () => [undefined, jest.fn()],
    useMMKVBoolean: () => [undefined, jest.fn()],
    createMMKV: () => new MMKVMock(),
  };
});

// react-native-iap — store kit / billing client not available in Jest
jest.mock('react-native-iap', () => {
  return {
    initConnection: jest.fn().mockResolvedValue(true),
    endConnection: jest.fn().mockResolvedValue(true),
    getProducts: jest.fn().mockResolvedValue([]),
    getSubscriptions: jest.fn().mockResolvedValue([]),
    getAvailablePurchases: jest.fn().mockResolvedValue([]),
    getPurchaseHistory: jest.fn().mockResolvedValue([]),
    requestPurchase: jest.fn().mockResolvedValue(undefined),
    requestSubscription: jest.fn().mockResolvedValue(undefined),
    acknowledgePurchaseAndroid: jest.fn().mockResolvedValue(undefined),
    consumePurchaseAndroid: jest.fn().mockResolvedValue(undefined),
    finishTransaction: jest.fn().mockResolvedValue(undefined),
    validateReceiptIos: jest.fn().mockResolvedValue({ valid: true }),
    validateReceiptAndroid: jest.fn().mockResolvedValue({ valid: true }),
    purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
    purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
    promotedProductListener: jest.fn(() => ({ remove: jest.fn() })),
    IAPErrorCode: { E_DEVELOPER_ERROR: 'E_DEVELOPER_ERROR' },
    ProductType: { inApp: 'inapp', subs: 'subs' },
    PurchaseState: { PURCHASED: 'PURCHASED', PENDING: 'PENDING', UNSPECIFIED: 'UNSPECIFIED' },
  };
});

// react-native-localize — uses TurboModuleRegistry.getEnforcing at load time
jest.mock('react-native-localize', () => ({
  getLocales: () => [
    {
      languageCode: 'en',
      countryCode: 'US',
      languageTag: 'en-US',
      isRTL: false,
    },
  ],
  getNumberFormatSettings: () => ({
    decimalSeparator: '.',
    groupingSeparator: ',',
  }),
  getCalendar: () => 'gregorian',
  getCountry: () => 'US',
  getCurrencies: () => ['USD'],
  getTemperatureUnit: () => 'fahrenheit',
  getTimeZone: () => 'America/Los_Angeles',
  uses24HourClock: () => true,
  usesMetricSystem: () => false,
  findBestLanguageTag: () => ({ languageTag: 'en', isRTL: false }),
  usesAutoDetect: () => false,
}));

// @shopify/react-native-skia — Skia binding not available in Jest
// Only the surface we touch in the App tree is mocked.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Canvas = React.forwardRef((_props, _ref) => null);
  // Recorder canvas stub — DrawListRenderer records (never plays) in tests.
  const recorderCanvas = {
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    drawImageRect: () => undefined,
    drawRect: () => undefined,
    drawCircle: () => undefined,
  };
  return {
    Canvas,
    // Avoid importing Skia at module load time — most consumers only need
    // the type surface for typechecking. Provide a stub.
    Skia: {
      Color: (c) => c,
      Paint: () => ({ setAlphaf() {}, setColor() {} }),
      XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
      PictureRecorder: () => ({
        beginRecording: () => recorderCanvas,
        finishRecordingAsPicture: () => ({ __mockPicture: true }),
      }),
      Shader: { Make: () => null },
      ColorFilter: { Make: () => null },
      Image: { Make: () => null },
      Path: { Make: () => null },
      Typeface: { MakeFreeTypeFaceFromData: () => null },
    },
    // Components used by the renderer
    Picture: () => null,
    Image: () => null,
    Rect: () => null,
    Circle: () => null,
    Text: () => null,
    Group: () => null,
    Path: () => null,
    RoundedRect: () => null,
    Line: () => null,
    Paint: () => null,
    // Hooks
    useImage: () => null,
    useFont: () => null,
    useDerivedValue: (fn) => ({ current: fn() }),
    useValue: (initial) => ({ current: initial }),
    // Compat re-export for components we don't use directly
    __ViewCompat: View,
  };
});

// react-native-screens — native module + expects compatibilityFlags export
// (used by @react-navigation/native-stack to feature-detect new header height impl)
jest.mock('react-native-screens', () => {
  const React = require('react');
  const { View } = require('react-native');
  // Mock the native stack primitives as plain Views so navigation renders
  const ScreenStackItem = React.forwardRef(({ children, ...props }, _ref) =>
    React.createElement(View, props, children),
  );
  const ScreenStack = React.forwardRef(({ children, ...props }, _ref) =>
    React.createElement(View, props, children),
  );
  const ScreenContainer = React.forwardRef(({ children, ...props }, _ref) =>
    React.createElement(View, props, children),
  );
  const Screen = React.forwardRef(({ children, ...props }, _ref) =>
    React.createElement(View, props, children),
  );
  const HeaderConfig = ({ children }) =>
    children != null ? React.createElement(React.Fragment, null, children) : null;
  const ScreenStackHeaderConfig = HeaderConfig;
  const ScreenStackHeaderSubview = HeaderConfig;
  const ScreenStackHeaderLeftView = HeaderConfig;
  const ScreenStackHeaderCenterView = HeaderConfig;
  const ScreenStackHeaderRightView = HeaderConfig;
  const ScreenStackHeaderBackButtonImage = HeaderConfig;
  const ScreenStackHeaderSearchBarView = HeaderConfig;
  const enableScreens = jest.fn(() => undefined);
  const enableFreeze = jest.fn(() => undefined);
  return {
    __esModule: true,
    default: {
      enableScreens,
      enableFreeze,
      screensEnabled: () => true,
    },
    enableScreens,
    enableFreeze,
    screensEnabled: () => true,
    shouldUseActivityState: true,
    compatibilityFlags: { usesNewAndroidHeaderHeightImplementation: false },
    ScreenContainer,
    Screen,
    ScreenStack,
    ScreenStackItem,
    ScreenStackHeaderConfig,
    ScreenStackHeaderSubview,
    ScreenStackHeaderLeftView,
    ScreenStackHeaderCenterView,
    ScreenStackHeaderRightView,
    ScreenStackHeaderBackButtonImage,
    ScreenStackHeaderSearchBarView,
    useTransitionProgress: () => ({ progress: 1, closing: 0, goingForward: 1 }),
  };
});

// react-native-safe-area-context — required for <SafeAreaProvider> in tests
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 375, height: 812 };
  // Real library exposes contexts; provide them so @react-navigation/elements'
  // SafeAreaProviderCompat can call React.useContext on them.
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);
  const SafeAreaProvider = ({ children }) =>
    React.createElement(
      SafeAreaInsetsContext.Provider,
      { value: insets },
      React.createElement(SafeAreaFrameContext.Provider, { value: frame }, children),
    );
  const SafeAreaConsumer = ({ children }) =>
    React.createElement(SafeAreaInsetsContext.Consumer, null, children);
  const SafeAreaView = ({ children, ...props }) =>
    React.createElement(View, props, children);
  return {
    SafeAreaProvider,
    SafeAreaConsumer,
    SafeAreaView,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});
