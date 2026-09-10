# 02 — Technical Architecture

> **Stack:** React Native 0.76 (Bare) · TypeScript 5.5 strict · Skia · Zustand · op-sqlite · MMKV

---

## 1. Goals & non-goals

### Goals
- 60fps on iPhone 11 / Pixel 4a (mid-tier 2019 device)
- Cold start ≤ 2.5s
- App size ≤ 80 MB installed
- Fully offline, no server dependency
- Modular enough that 10+ build agents can work in parallel

### Non-goals
- No cloud sync, no accounts, no analytics SDK (deferred)
- No ads SDK (deferred)
- No console port
- No PWA / web target

---

## 2. Layered architecture

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 6 — UI (React Native components, screens, modals)     │
│            src/ui/, src/screens/                              │
├──────────────────────────────────────────────────────────────┤
│  LAYER 5 — Game UI overlays (HP bars, dialogue, menus       │
│            rendered as Skia overlays OR RN components)        │
│            src/game/ui/                                        │
├──────────────────────────────────────────────────────────────┤
│  LAYER 4 — Game systems (combat, puzzle, narrative)          │
│            src/game/systems/                                   │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3 — Game engine core (ECS, fixed-timestep loop,        │
│            scene graph, event bus)                             │
│            src/game/engine/                                    │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 — Rendering (Skia canvas, sprite system, tile map)  │
│            src/game/render/                                    │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1 — Platform (RN bridge, MMKV, op-sqlite, IAP, audio) │
│            src/platform/                                       │
├──────────────────────────────────────────────────────────────┤
│  Native shells — ios/ and android/ (RN bare workflow)         │
└──────────────────────────────────────────────────────────────┘
```

**Strict layering rule:** Layer N may only import from Layer N-1 or below.
Layer 6 (UI) may import any layer. Layer 1 (Platform) imports only RN core
and native modules. **No circular dependencies.**

This is enforced by `eslint-plugin-import` rules in `.eslintrc.js`.

---

## 3. Module structure (`src/`)

```
src/
├── app/                      # App entry, root providers, navigation
│   ├── App.tsx
│   ├── Providers.tsx
│   └── RootNavigator.tsx
│
├── platform/                 # Layer 1: thin wrappers over native modules
│   ├── storage/
│   │   ├── mmkv.ts           # MMKV instance
│   │   └── sqlite.ts         # op-sqlite instance + migrations
│   ├── iap/
│   │   └── iapClient.ts      # react-native-iap wrapper
│   ├── audio/
│   │   ├── sfx.ts
│   │   └── music.ts
│   ├── haptics/
│   │   └── haptics.ts
│   ├── locale/
│   │   └── locale.ts
│   └── device/
│       └── device.ts         # screen size, refresh rate, safe area
│
├── i18n/                     # i18next setup + locale list
│   ├── index.ts
│   ├── locales/
│   │   ├── en/
│   │   ├── ar/
│   │   ├── es/   (stub)
│   │   └── de/   (stub)
│
├── game/
│   ├── engine/               # Layer 3: ECS, loop, events
│   │   ├── ecs/
│   │   │   ├── entity.ts
│   │   │   ├── component.ts
│   │   │   ├── system.ts
│   │   │   └── world.ts
│   │   ├── loop/
│   │   │   ├── GameLoop.ts   # fixed-timestep, 60Hz
│   │   │   └── ticker.ts
│   │   ├── events/
│   │   │   └── EventBus.ts
│   │   └── scene/
│   │       └── SceneManager.ts
│   │
│   ├── render/               # Layer 2: Skia
│   │   ├── canvas/
│   │   │   ├── GameCanvas.tsx
│   │   │   └── Camera.ts
│   │   ├── sprites/
│   │   │   ├── SpriteSheet.ts
│   │   │   ├── SpriteAnimator.ts
│   │   │   └── atlas.ts
│   │   ├── tiles/
│   │   │   ├── TileMap.ts
│   │   │   └── TileRenderer.ts
│   │   └── effects/
│   │       ├── Particles.ts
│   │       └── ScreenShake.ts
│   │
│   ├── systems/              # Layer 4: game systems
│   │   ├── combat/
│   │   │   ├── CombatSystem.ts
│   │   │   ├── turnResolver.ts
│   │   │   └── damageFormula.ts
│   │   ├── puzzle/
│   │   │   ├── PuzzleManager.ts
│   │   │   └── mechanics/
│   │   │       ├── ReflexPuzzle.ts
│   │   │       ├── SequencePuzzle.ts
│   │   │       ├── PathPuzzle.ts
│   │   │       ├── TimingPuzzle.ts
│   │   │       ├── LogicPuzzle.ts
│   │   │       └── MazePuzzle.ts
│   │   ├── narrative/
│   │   │   └── DialogueRunner.ts
│   │   ├── movement/
│   │   │   └── MovementSystem.ts
│   │   └── ai/
│   │       └── EnemyAI.ts
│   │
│   ├── content/              # Level data loaders
│   │   ├── levelLoader.ts
│   │   ├── actLoader.ts
│   │   └── contentIndex.ts
│   │
│   └── ui/                   # Layer 5: in-game UI overlays
│       ├── HUD.tsx
│       ├── DialogueBox.tsx
│       ├── PuzzleHUD.tsx
│       └── CombatUI.tsx
│
├── domain/                   # Pure logic, no RN, no Skia, easily testable
│   ├── models/
│   │   ├── Hero.ts
│   │   ├── Companion.ts
│   │   ├── Enemy.ts
│   │   ├── Item.ts
│   │   ├── Skill.ts
│   │   └── Stats.ts
│   ├── systems/
│   │   ├── leveling.ts       # XP curve
│   │   ├── damage.ts
│   │   └── loot.ts
│   └── content/
│       ├── actCatalog.ts
│       └── puzzleCatalog.ts
│
├── data/                     # App-level data, NOT raw content
│   ├── stores/               # Zustand stores (Layer 5 boundary)
│   │   ├── playerStore.ts
│   │   ├── partyStore.ts
│   │   ├── inventoryStore.ts
│   │   ├── progressStore.ts
│   │   ├── settingsStore.ts
│   │   └── sessionStore.ts
│   ├── persistence/
│   │   ├── saveManager.ts
│   │   ├── eventLog.ts
│   │   └── migrations.ts
│   └── queries/
│       ├── progressQueries.ts
│       ├── inventoryQueries.ts
│       └── settingsQueries.ts
│
├── ui/                       # Layer 6: pure UI components
│   ├── primitives/           # Button, Text, Icon, View wrappers
│   ├── composed/             # Card, Modal, Tabs, List
│   ├── screens/              # Full screens
│   └── theme/
│       ├── tokens.ts
│       ├── colors.ts
│       ├── typography.ts
│       └── spacing.ts
│
└── shared/                   # Cross-cutting utilities
    ├── result.ts             # Result<T,E> type
    ├── eventEmitter.ts
    ├── math.ts
    ├── id.ts                 # nanoid wrapper
    └── log.ts
```

---

## 4. Runtime model

### 4.1 Boot sequence

```
1. index.js (RN entry)
   ↓
2. AppRegistry.registerComponent('Olympian', () => App)
   ↓
3. App.tsx
   ├── <Providers>
   │   ├── <SafeAreaProvider>
   │   ├── <I18nextProvider>
   │   ├── <GestureHandlerRootView>
   │   ├── <MmkvHydrator>  ← reads MMKV settings, hydrates Zustand
   │   └── <SqliteHydrator> ← opens DB, runs migrations, loads progress
   ├── <RootNavigator />   ← decides first screen based on save state
   └── </Providers>
   ↓
4. First paint of root screen (target: <2.5s on Pixel 4a)
```

### 4.2 Game loop

Two loops, decoupled:

**UI loop** — React Native's standard render cycle, ~60fps on UI thread.
Used for: menus, dialogue, HUD, settings, navigation.

**Game loop** — Fixed-timestep, 60Hz, runs on RN's JS thread but driven by
`requestAnimationFrame` throttled to device refresh rate.

```typescript
// Pseudocode — see src/game/engine/loop/GameLoop.ts
class GameLoop {
  private accumulator = 0;
  private readonly FIXED_DT = 1 / 60;

  tick(deltaMs: number) {
    this.accumulator += deltaMs / 1000;
    while (this.accumulator >= this.FIXED_DT) {
      this.world.step(this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
    }
    this.world.render();
  }
}
```

**Why fixed timestep:** gameplay is deterministic. Puzzle timeouts, combat
turns, and AI must behave identically regardless of device framerate.

### 4.3 Threading model

| Concern | Thread |
|---|---|
| UI components | RN UI thread (main on iOS, main on Android) |
| Reanimated animations | RN UI thread (worklets) |
| Skia canvas drawing | RN UI thread |
| Game logic (ECS step) | RN JS thread |
| DB writes (op-sqlite) | Native, sync from JS |
| MMKV reads/writes | Native, sync from JS |
| Audio playback | Native, async from JS |
| IAP | Native, async callbacks |

**Critical rule:** game logic on JS thread must complete in **<8ms per tick**
to leave 8ms for React reconciliation. If exceeded, log a perf warning and
flag the offending system.

---

## 5. Build pipeline

### 5.1 Asset bake (build-time)

```
assets-raw/ (Piskel exports, .ogg audio, .tmx tilemaps)
  ↓ scripts/bake-assets.ts
assets/ (baked sprite sheets .png + .json, audio .ogg, tilesets .json)
  ↓ Metro bundler
app bundle (JS + assets)
  ↓ Gradle / Xcode
.apk / .ipa
```

**Bake script** (`scripts/bake-assets.ts`) is the source of truth for
which raw assets become which baked artifacts. It enforces:
- Shared palette (rejects off-palette pixels)
- Tile size consistency (16×16 or 32×32 only)
- Sprite sheet size limit (1024×1024 max per sheet)
- Audio format: OGG Vorbis, mono, 44.1kHz
- Audio loudness: normalized to -16 LUFS

### 5.2 DB seed (build-time)

```
data/seed/*.json
  ↓ scripts/seed-db.ts
op-sqlite database bundled into app
```

The DB is built and bundled as a `.db` file in the app's `assets/` folder.
On first launch, it's copied to the app's documents directory and migrations
run from there.

### 5.3 Release build

```
yarn build:ios:release
yarn build:android:release
```

- iOS: Xcode → archive → upload to App Store Connect
- Android: Gradle → bundleRelease → upload to Google Play Console
- Both produce source maps and ProGuard/R8 mappings uploaded to crash
  reporting service (deferred)

---

## 6. Configuration

### 6.1 Environment variables

| Var | Purpose | Default |
|---|---|---|
| `OLYMPIAN_ENV` | `dev` / `staging` / `prod` | `dev` |
| `OLYMPIAN_LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `info` |
| `OLYMPIAN_SENTRY_DSN` | (deferred) | — |
| `OLYMPIAN_PAYWALL_ENABLED` | `true` / `false` | `true` (stubbed) |
| `OLYMPIAN_DEFAULT_LOCALE` | `en` / `ar` | `en` |

Loaded by `react-native-config` at app start.

### 6.2 Feature flags

All flags live in MMKV under `flags/`:

```typescript
type Flag =
  | 'show_paywall_button'    // default true
  | 'enable_haptics'         // default true
  | 'enable_particle_fx'     // default true
  | 'show_analytics'         // default false (deferred)
  | 'debug_overlay'          // default false in prod
  | 'force_locale'           // default null (uses device)
```

`settingsStore` (Zustand) reads from MMKV on hydrate, writes back on change.

---

## 7. Performance budgets (hard limits)

| Metric | Budget | How measured |
|---|---|---|
| App size | ≤ 80 MB | Post-build, both platforms |
| Cold start | ≤ 2.5s on Pixel 4a | `performance.now()` in App.tsx mount |
| Frame time | ≤ 16.67ms p95 | Reanimated profiler |
| JS tick time | ≤ 8ms p95 | Game loop instrumentation |
| Memory | ≤ 250 MB resident | Android Profiler, Xcode Instruments |
| DB query | ≤ 50ms p95 | op-sqlite timing wrapper |
| Level load | ≤ 200ms p95 | `levelLoader` instrumentation |
| Audio latency | ≤ 100ms tap-to-SFX | `react-native-sound` callback |

Exceeding any budget blocks the release. CI runs these in `yarn perf:check`.

---

## 8. ADRs (Architecture Decision Records)

> Brief, dated, immutable. Add a new ADR, never edit an old one.

### ADR-001 · 2026-09-09 · React Native Bare over Expo
**Status:** Accepted
**Context:** Need direct native module access (Skia, op-sqlite, MMKV, IAP)
without the EAS build pipeline.
**Decision:** RN 0.76 Bare workflow. Custom ios/ and android/ folders.
**Consequences:** Manual native dependency updates, but full control.

### ADR-002 · 2026-09-09 · Skia over WebGL/Canvas
**Status:** Accepted
**Context:** Need 60fps 2D rendering with sprite batching, tile maps, and
custom shaders for screen effects.
**Decision:** `@shopify/react-native-skia`. Runs on UI thread, native perf.
**Consequences:** Locked into Skia's API surface; some effects are Skia-specific.

### ADR-003 · 2026-09-09 · Zustand over Redux Toolkit
**Status:** Accepted
**Context:** App state is small (< 50 slices total), game state is
high-frequency.
**Decision:** Zustand + Immer. Per-slice selectors minimize re-renders.
**Consequences:** No time-travel debugging, but trivial store creation and
no boilerplate.

### ADR-004 · 2026-09-09 · op-sqlite over expo-sqlite / sqlite-storage
**Status:** Accepted
**Context:** Need JSI-based, synchronous query interface for hot paths
(e.g., loading a level's tile data on render).
**Decision:** `@op-engineering/op-sqlite`.
**Consequences:** Bare workflow only (no Expo). Slightly newer library, but
2–5x faster than alternatives per benchmarks.

### ADR-005 · 2026-09-09 · Local-only MVP, no server
**Status:** Accepted
**Context:** Pre-launch. No telemetry, no accounts, no cloud save.
**Decision:** All state in op-sqlite + MMKV. No network code in MVP.
**Consequences:** Simpler threat model, no GDPR concerns at MVP, but
adds migration work if cloud sync is later required. The event log
(see [`04-state-management.md`](./04-state-management.md#event-log)) keeps
a forward-compatible replay buffer to ease future cloud sync.

### ADR-006 · 2026-09-09 · ECS for game entities
**Status:** Accepted
**Context:** Game has ~50 entity types (hero, companions, enemies, props,
projectiles, particles). Most systems only care about a subset of components.
**Decision:** Manual ECS — entity = id, components = plain data records,
systems = pure functions. Inspired by Bevy/EnTT but minimal.
**Consequences:** More boilerplate than OOP, but enables parallel system
work and clean serialization (save game = snapshot entity table).

### ADR-007 · 2026-09-09 · Deferred monetization
**Status:** Accepted
**Context:** Pre-launch. Cannot price without playtest data.
**Decision:** Paywall screen and IAP integration built, but products are
stubbed. The `OLYMPIAN_PAYWALL_ENABLED` flag toggles visibility.
**Consequences:** Architecture supports monetization at zero refactor cost
when pricing decisions land. UI is not exposed to players in MVP.

---

## 9. Security & privacy

- **No PII collected.** Game state is local. No analytics SDK. No crash
  reporting SDK in MVP. (Sentry-style SDKs are easy to add later.)
- **No network calls** in MVP except IAP (which goes through Apple/Google,
  not a third-party server).
- **IAP receipt validation** is server-side (Apple/Google handles). No
  custom server. The app trusts receipts returned by `react-native-iap` and
  persists an `iap_owned` boolean in MMKV.
- **Save file integrity:** on every save, compute SHA-256 of the serialized
  state. On load, verify. If mismatch, fall back to last auto-save.
- **Cheating** is not a concern for a single-player offline game. Skip
  anti-cheat.

---

## 10. Testing strategy (summary, full in 14)

| Layer | Tool | What it tests |
|---|---|---|
| Unit | Jest | domain logic, leveling, damage formulas, puzzle solvers |
| Component | @testing-library/react-native | UI components, screens |
| Integration | Jest + RN test renderer | Stores, persistence, navigation |
| E2E | Detox | Critical user flows: tutorial → first boss → Act 1 clear |
| Visual regression | (optional) react-native-snapshot | HUD, screens |
| Performance | Reanimated profiler | Frame budgets |

**Coverage target:** 80% on `src/domain/`, 60% on `src/game/systems/`,
40% on UI, 0% on `src/game/render/` (visual, tested by hand).

---

## 11. Dependencies (pinned versions)

```json
{
  "dependencies": {
    "react": "18.3.1",
    "react-native": "0.76.5",
    "typescript": "5.5.4",
    "@shopify/react-native-skia": "1.5.0",
    "react-native-reanimated": "3.16.1",
    "react-native-gesture-handler": "2.20.2",
    "@react-navigation/native": "7.0.13",
    "@react-navigation/native-stack": "7.1.13",
    "zustand": "5.0.1",
    "immer": "10.1.1",
    "@op-engineering/op-sqlite": "11.0.0",
    "react-native-mmkv": "3.1.0",
    "react-native-iap": "12.15.0",
    "i18next": "23.16.4",
    "react-i18next": "15.1.1",
    "react-native-localize": "3.3.0",
    "react-native-sound": "0.11.2",
    "react-native-track-player": "4.1.1",
    "@d11/react-native-fast-image": "8.6.3",
    "react-native-config": "1.5.3",
    "nanoid": "5.0.7"
  },
  "devDependencies": {
    "jest": "29.7.0",
    "@testing-library/react-native": "12.7.2",
    "detox": "20.27.0",
    "eslint": "9.13.0",
    "prettier": "3.3.3",
    "typescript-eslint": "8.10.0",
    "@types/react": "18.3.11"
  }
}
```

**Lockfile:** `yarn.lock` (Yarn 1.x classic, not Berry — simpler CI).

---

## 12. Open architectural questions

These are deliberately left unresolved at MVP. Resolve at v1.0 planning.

1. **Cloud save strategy** — replay event log vs snapshot full state
2. **Multiplayer** — out of scope, but RN supports it
3. **Mod support** — out of scope
4. **Modding tools** — out of scope
5. **Console port** — RN's Switch support is alpha; revisit post-v1.0
