# Olympian

**Mobile-first Greek-mythology action-RPG + puzzle game.**
React Native (bare) · TypeScript strict · Skia-rendered pixel art · local-only
data · EN/AR (RTL) · 100 levels.

> Current status: **Phase 2 — Vertical Slice**. The hero, movement, the Act 1
> overworld, the first playable room, marker interactions, and scene
> transitions are implemented and covered by the test suite below.

---

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node.js | ≥ 22.11 | everything (tests, tooling, Metro) |
| npm | ≥ 10 | everything |
| Xcode + CocoaPods (macOS) | Xcode 16+ | iOS simulator / device |
| Android Studio | incl. SDK 35 + emulator | Android emulator / device |

You do **not** need Xcode or Android Studio to run the QA pipeline — only to
see the game running on a screen.

---

## 1. Run the QA pipeline (no simulator required)

```sh
npm install

npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint
npm test            # jest — 28 suites / 374 tests
npm run prebuild    # bake sprite atlases + build DB + validate content + i18n coverage

# or everything at once:
npm run ci          # lint && typecheck && test && prebuild
```

`npm run prebuild` regenerates everything under `assets/` from the
deterministic generators in `scripts/` — never edit files in `assets/` by
hand.

### See the pixel art without a simulator

```sh
npx ts-node --project tsconfig.scripts.json scripts/generate-sprites.ts   # hero strip, tiles, all map renders
npx ts-node --project tsconfig.scripts.json scripts/preview-sprites.ts    # labelled hero animation grid
```

Output lands in `scripts/preview/` (gitignored): `hero_grid.png`,
`hero_preview.png`, `tiles_row.png`, `map_demo_glade.png`,
`map_act1_overworld.png`, `map_act1_room.png`.

---

## 2. Run the game (see the real UI)

### Android (emulator or USB device)

```sh
# 1. Start an emulator from Android Studio (Device Manager) or plug in a device
# 2. Then:
npm start           # keep Metro running
npm run android     # in a second terminal — builds & installs the debug app
```

### iOS (simulator or device, macOS only)

```sh
bundle install                       # first time only (installs CocoaPods)
bundle exec pod install              # first time or after native dependency changes
npm start                            # keep Metro running
npm run ios                          # in a second terminal — builds & boots the simulator
```

You can also open `android/` in Android Studio or `ios/Olympian.xcworkspace`
in Xcode and press **Run** — Metro still needs to be running (`npm start`).

### What you should see

1. **Boot gate → Title screen** with theme-aware branding.
2. **Language picker** — English or Arabic (the whole UI mirrors for RTL).
3. **Hub → Overworld** — the Act 1 overworld map; move the hero with the
   on-screen joystick (touch) or arrow keys / WASD in the simulator.
4. Walk onto a **marker** to get an interaction prompt and transition into
   the first playable room (vertical slice level).

---

## 3. Project layout

```
src/
  app/        # App shell, providers, root navigator
  ui/         # Design tokens, primitives, composed components, screens
  game/       # ECS engine, systems, scenes, render (Skia), entities
  platform/   # MMKV, SQLite, audio, IAP, haptics, locale bridges
  data/       # Zustand stores, render bus, input store
  i18n/       # i18next setup, EN/AR resources, RTL mirroring
scripts/      # Asset generators (sprites, tilemaps, DB, validators)
assets/       # Baked output — regenerable, do not edit
spec/         # Authoritative specification kit (start at spec/tasks.md)
```

`spec/tasks.md` is the single source of truth for what is built and what is
next. Phase/status tracking lives there.

---

## Troubleshooting

- **Metro port busy** → `npx react-native start --reset-cache --port 8082` and
  reload the app.
- **iOS build fails after pulling** → re-run `bundle exec pod install`.
- **Stale sprites in game** → `npm run prebuild` then reload Metro
  (`r` in the Metro terminal).
- **Clear Android debug state** → `cd android && ./gradlew clean`.
