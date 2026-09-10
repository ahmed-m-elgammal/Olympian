# 14 — Build, Test & Milestones

> **Build:** React Native 0.76 (Bare) + Gradle + Xcode
> **Test:** Jest + @testing-library/react-native + Detox
> **Sprint:** 4 months, 5 phases
> **Output:** iOS + Android builds uploaded to TestFlight / Play Console
> internal track

---

## 1. Repo layout (full)

```
olympian/
├── android/                              # RN bare workflow Android shell
│   ├── app/
│   │   ├── build.gradle
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/com/olympian/       # MainActivity, MainApplication
│   │   │   ├── res/                      # icons, splash
│   │   │   └── assets/                   # bundled DB, fonts
│   │   └── proguard-rules.pro
│   ├── build.gradle
│   ├── gradle.properties
│   └── settings.gradle
│
├── ios/                                  # RN bare workflow iOS shell
│   ├── Olympian/
│   │   ├── AppDelegate.h
│   │   ├── AppDelegate.mm
│   │   ├── Info.plist
│   │   ├── LaunchScreen.storyboard
│   │   └── Images.xcassets/              # icons
│   ├── Olympian.xcodeproj/
│   └── Podfile
│
├── src/                                  # all TypeScript app code (see 02)
│
├── assets/                               # baked output (committed)
│   ├── sprites/
│   ├── audio/
│   ├── tilemaps/
│   └── palettes/
│
├── assets-raw/                           # human-authored source (committed)
│   ├── sprites/
│   ├── audio/
│   ├── tilemaps/
│   └── palettes/
│
├── data/                                 # seed JSON + JSON schemas
│   ├── seed/
│   │   ├── items.json
│   │   ├── enemies.json
│   │   ├── companions.json
│   │   ├── levels/
│   │   │   ├── act1/
│   │   │   │   ├── area1/
│   │   │   │   │   ├── room1.json
│   │   │   │   │   ├── room2.json
│   │   │   │   │   └── ...
│   │   │   │   └── ...
│   │   │   └── ...
│   │   ├── dialogues.json
│   │   └── iap_products.json
│   └── schemas/
│       ├── level.schema.json
│       ├── item.schema.json
│       └── ...
│
├── scripts/                              # Node.js build scripts
│   ├── bake-assets.ts
│   ├── build-db.ts
│   ├── seed-db.ts
│   ├── validate-content.ts
│   ├── i18n-coverage.ts
│   └── perf-check.ts
│
├── docs/
│   └── spec-kit/                         # ← this directory
│
├── __tests__/                            # all tests live here
│   ├── domain/
│   ├── game/
│   ├── data/
│   ├── platform/
│   └── e2e/
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # lint + test + build
│       └── release.yml                   # tagged release → store upload
│
├── .eslintrc.js
├── .prettierrc.js
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── react-native.config.js
├── jest.config.js
├── detox.config.js
├── package.json
├── yarn.lock
├── .nvmrc                                # node version pin
├── .gitignore
└── README.md
```

### 1.1 `package.json` scripts

```json
{
  "scripts": {
    "start": "react-native start",
    "ios": "react-native run-ios",
    "android": "react-native run-android",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "detox test",
    "test:e2e:build:ios": "detox build --configuration ios.sim.debug",
    "test:e2e:build:android": "detox build --configuration android.emu.debug",
    "assets:bake": "ts-node scripts/bake-assets.ts",
    "db:build": "ts-node scripts/build-db.ts",
    "db:seed": "ts-node scripts/seed-db.ts",
    "content:validate": "ts-node scripts/validate-content.ts",
    "i18n:coverage": "ts-node scripts/i18n-coverage.ts",
    "perf:check": "ts-node scripts/perf-check.ts",
    "prebuild": "yarn assets:bake && yarn db:build && yarn content:validate && yarn i18n:coverage",
    "build:ios:dev": "yarn prebuild && react-native run-ios",
    "build:ios:release": "yarn prebuild && cd ios && xcodebuild -workspace Olympian.xcworkspace -scheme Olympian -configuration Release",
    "build:android:dev": "yarn prebuild && react-native run-android",
    "build:android:release": "yarn prebuild && cd android && ./gradlew assembleRelease",
    "ci": "yarn lint && yarn typecheck && yarn test && yarn prebuild"
  }
}
```

---

## 2. Build configuration

### 2.1 iOS (`ios/Podfile`)

```ruby
platform :ios, '14.0'
use_react_native!
use_native_modules!

target 'Olympian' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
    :fabric_enabled => true,
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )
end
```

**Targets:**
- iOS 14.0+ (covers ~95% of active devices in 2026)
- Hermes JS engine enabled
- Fabric (new arch) enabled
- Bitcode disabled

### 2.2 Android (`android/app/build.gradle`)

```gradle
android {
  compileSdkVersion 35
  minSdkVersion 24          // Android 7.0 — covers ~98% of devices
  targetSdkVersion 35
  
  defaultConfig {
    applicationId "com.olympian.app"
    versionCode 1
    versionName "0.1.0"
  }
  
  buildTypes {
    release {
      minifyEnabled true
      shrinkResources true
      proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
      signingConfig signingConfigs.release
    }
  }
}
```

**Targets:**
- minSdk 24 (Android 7.0)
- compileSdk 35 (Android 15)
- R8 minification enabled for release
- ProGuard rules in `proguard-rules.pro` (preserve React Native bridge classes)

---

## 3. Tooling

### 3.1 Required tools (developer setup)

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS | RN bundler, scripts |
| Yarn | 1.22.x | package manager |
| JDK | 17 | Android build |
| Android Studio | Hedgehog (2023.1.1)+ | Android SDK, emulator |
| Xcode | 15.4+ | iOS build, simulator |
| CocoaPods | 1.14+ | iOS native deps |
| FFmpeg | 6.x | audio bake |
| Watchman | 4.9+ | RN file watcher |

### 3.2 First-time setup

```bash
# 1. Clone
git clone https://github.com/olympian/game.git
cd game

# 2. Install JS deps
yarn install

# 3. Install iOS pods
cd ios && pod install && cd ..

# 4. Build assets
yarn assets:bake

# 5. Build seed DB
yarn db:build

# 6. Run
yarn ios     # or yarn android
```

---

## 4. Testing strategy

### 4.1 Test pyramid

```
       /\
      /  \      E2E (Detox) — critical user flows, ~10 tests
     /────\
    /      \    Integration — stores, persistence, ~50 tests
   /────────\
  /          \  Unit — domain logic, ~200 tests
 /────────────\
```

### 4.2 Unit tests (Jest)

| Module | Coverage target | Test file |
|---|---|---|
| `src/domain/**` | 90% | colocated `*.test.ts` |
| `src/game/systems/**` | 70% | `src/game/systems/__tests__/` |
| `src/data/queries/**` | 80% | `src/data/queries/__tests__/` |
| `src/platform/**` | 60% | `src/platform/__tests__/` |
| `src/ui/primitives/**` | 40% | snapshot tests |
| `src/game/render/**` | 0% | visual, manual |

### 4.3 Integration tests

- **DB round-trip:** write save → read save → modify → read again
- **Store actions:** every Zustand store action, paired with DB write
- **Scene load:** `loadScene` for each scene type, verify entities
- **Puzzle solve:** 5 deterministic configs, verify state and result
- **Combat:** 10 scripted fights, verify damage and turn order

### 4.4 E2E tests (Detox)

The 10 critical flows:

1. **Cold start → first save → first level → first boss clear**
2. **Death → respawn at hub → retry level → success**
3. **Inventory: pickup → equip → use in combat**
4. **Party swap in hub → fight with new party**
5. **Settings change → restart → verify persisted**
6. **Language switch EN → AR → verify RTL applied**
7. **IAP: hidden debug menu → paywall → mock purchase → content unlocked**
8. **App backgrounded mid-puzzle → restored on resume**
9. **Save corruption simulation → fall back to last auto-save**
10. **Full Act 1 playthrough** (longest, runs ~30 min in simulator)

### 4.5 Performance tests

- `perf:check` script measures:
  - Bundle size (JS + native)
  - Sprite sheet count and total KB
  - Audio file count and total MB
  - Cold start time (synthetic, on a known device profile)
  - Number of components in largest store

Failures block release.

### 4.6 Visual regression (optional, deferred)

If time permits, snapshot test the key screens:
- Title
- Hub
- Level clear modal
- Boss defeated modal
- Paywall

Use `react-native-snapshot` or `jest-image-snapshot`. Snapshots stored
in `__snapshots__/`. Updated on intentional UI changes.

---

## 5. CI/CD

### 5.1 GitHub Actions: `ci.yml`

Runs on every PR and push to main:

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: yarn install --frozen-lockfile
      - run: yarn lint
      - run: yarn typecheck
      - run: yarn test --ci
      - run: yarn prebuild
      - run: yarn content:validate
      - run: yarn i18n:coverage
      - run: yarn perf:check

  build-android:
    needs: test
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - run: yarn build:android:release
      - uses: actions/upload-artifact@v4
        with:
          name: olympian-android
          path: android/app/build/outputs/apk/release/app-release.apk

  build-ios:
    needs: test
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - run: cd ios && pod install
      - run: yarn build:ios:release
      - uses: actions/upload-artifact@v4
        with:
          name: olympian-ios
          path: ios/build/Olympian.ipa
```

### 5.2 GitHub Actions: `release.yml`

Runs on tag push (`v*.*.*`):

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - run: yarn build:android:release
      - run: yarn build:ios:release
      # Upload to TestFlight
      - name: Upload to TestFlight
        run: xcrun altool --upload-app ...
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APP_PASSWORD: ${{ secrets.APP_PASSWORD }}
      # Upload to Play Console internal track
      - name: Upload to Play Console
        run: fastlane supply ...
        env:
          GOOGLE_PLAY_KEY: ${{ secrets.GOOGLE_PLAY_KEY }}
```

### 5.3 Required secrets

| Secret | Purpose |
|---|---|
| `APPLE_ID` | Apple developer account email |
| `APP_PASSWORD` | App-specific password for altool |
| `GOOGLE_PLAY_KEY` | JSON key for Google Play API |

---

## 6. Milestones (the 4-month sprint)

> Build agents should treat each milestone as a checkpoint. Demo-able
> at the end of each.

### Sprint 1 — Foundation (Month 1, weeks 1–4)

**Goal:** Empty game that boots, navigates, and renders a colored rectangle.

- Week 1:
  - [ ] Repo scaffold (RN bare, both platforms build)
  - [ ] CI green (lint, typecheck, test, build)
  - [ ] Asset pipeline + palette + 1 test sprite
- Week 2:
  - [ ] DB layer (op-sqlite) + migrations + 1 seed table
  - [ ] MMKV integration
  - [ ] All 6 stores skeleton
  - [ ] i18n setup with EN/AR partial strings
- Week 3:
  - [ ] Skia canvas renders 1 sprite
  - [ ] Game loop ticks at 60Hz
  - [ ] ECS + 2 systems (movement, render)
  - [ ] Tile map renders from a single .tmx
- Week 4:
  - [ ] Navigation: BootGate → Title → Hub (placeholder)
  - [ ] Settings screen working (audio volume, language)
  - [ ] RTL toggle works
  - [ ] Audio: 1 music track + 3 SFX playable

**Demo:** Boot app, see title screen, tap to enter hub, change
language EN→AR, see layout flip, hear music. No actual gameplay yet.

### Sprint 2 — Vertical slice (Month 2, weeks 5–8)

**Goal:** One playable Act 1 (8 levels + boss) end-to-end.

- Week 5:
  - [ ] Hero sprite + walk + idle animations
  - [ ] Movement system (joystick → position)
  - [ ] Camera follows player
  - [ ] One Act 1 overworld tilemap, walkable
- Week 6:
  - [ ] 1 puzzle room playable: Reflex mechanic
  - [ ] HUD overlays
  - [ ] Level clear modal
  - [ ] Save/load on level clear
- Week 7:
  - [ ] 1 enemy, 1 combat (turn-based, basic attack only)
  - [ ] Boss 1 (Nemean Lion) with phase 1 + phase 2 (Reflex)
  - [ ] Relic reward
- Week 8:
  - [ ] 7 more Act 1 levels (mix of all 6 mechanics)
  - [ ] Inventory basics (pickup, equip, use)
  - [ ] Settings persist
  - [ ] Bug bash

**Demo:** Play Act 1 from intro to Nemean Lion boss clear. ~30 min
playtime. All 6 puzzle mechanics represented at least once.

### Sprint 3 — Content (Month 3, weeks 9–12)

**Goal:** Acts 1–6 complete (50 levels), full game loop polished.

- Week 9:
  - [ ] Acts 2–3 content (16 levels, 2 bosses)
  - [ ] Companion join (Hind at Act 3 boss)
  - [ ] Party management UI
- Week 10:
  - [ ] Acts 4–5 content (16 levels, 2 bosses)
  - [ ] Skills (4 per character, all implemented)
  - [ ] Level-up flow
- Week 11:
  - [ ] Act 6 content (8 levels, 1 boss)
  - [ ] All 14 enemy types implemented
  - [ ] Combat polish (animations, hit-stun, VFX)
- Week 12:
  - [ ] Full Arabic translation
  - [ ] All audio (music, ambience, SFX) in place
  - [ ] Bug bash + perf tuning
  - [ ] Internal TestFlight build

**Demo:** Full Act 1–6 playtest, ~3 hours content. Internal testers
play, file bugs.

### Sprint 4 — Polish + Launch (Month 4, weeks 13–16)

**Goal:** v1.0 ready for public release (Acts 7–12 added, polish,
i18n, store submission).

- Week 13:
  - [ ] Acts 7–12 content (50 more levels, 6 bosses)
  - [ ] Underworld finale with all 6 mechanics fused
  - [ ] Companion 4 (Orpheus, hidden)
- Week 14:
  - [ ] Accessibility: text scale, color-blind modes, reduce motion
  - [ ] One-handed mode
  - [ ] Bug bash
- Week 15:
  - [ ] App store assets (icon, screenshots, description)
  - [ ] Spanish + German stub locales
  - [ ] Final perf check
  - [ ] Paywall wired (still hidden in MVP build)
- Week 16:
  - [ ] Closed beta (TestFlight + Play internal)
  - [ ] Final QA
  - [ ] Submit to App Store + Play Store
  - [ ] Marketing site / trailer (out of scope here)

**Demo:** Complete 100-level game, polished, on both stores.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Skia perf on low-end Android | Medium | High | Profile early (Sprint 2), drop to 30fps for low-end |
| IAP sandbox flaky | Medium | Medium | Mock IAP in tests, manual verify pre-release |
| RN 0.76 + Skia compat issues | Low | High | Spike in Sprint 1 week 1 |
| RTL bugs in custom components | High | Medium | Storybook + visual regression on every screen |
| 50+ levels take longer than estimated | High | High | Stretch goal: 30 levels MVP, defer Acts 7–12 |
| Audio asset production is slow | High | Medium | Use placeholder chiptune SFX, swap later |
| Apple/Google review delays | Medium | Medium | Submit 1 week before public launch |
| op-sqlite bugs | Low | High | Have expo-sqlite as fallback in mind |

---

## 8. Launch checklist (pre-submission)

- [ ] Privacy policy published at olympian.com/privacy
- [ ] Terms of service published
- [ ] App Store Connect app record created
- [ ] Google Play Console app record created
- [ ] All IAP products configured (post-playtest)
- [ ] App icon (1024×1024) and feature graphic (1024×500)
- [ ] Screenshots (6.5", 5.5" iOS; phone, tablet Android)
- [ ] App description (EN + AR)
- [ ] Keywords and categories
- [ ] Age rating questionnaire completed
- [ ] Data safety form (Apple) / Data safety section (Google)
  - "No data collected" — fits our local-only architecture
- [ ] Export compliance (Apple): use of cryptography
  - Answer: "No" (we don't use encryption beyond standard HTTPS via
    RN core, which is exempt)
- [ ] IDFA declaration (Apple): answer "No" (no ads SDK)

---

## 9. Post-launch operations

Deferred to v1.1+, but listed for completeness:

- Crash reporting (Sentry)
- Analytics (privacy-friendly, e.g., Plausible self-hosted)
- A/B testing for paywall
- Push notifications (companion join reminders?)
- Daily quests
- Cloud save (server, account system)

---

## 10. Versioning

- App version: `MAJOR.MINOR.PATCH` (semver).
  - MAJOR: content break (Acts 7–12 add → 1.0, 2.0)
  - MINOR: feature add (cloud save → 1.1)
  - PATCH: bug fix
- Build number: monotonically increasing integer per platform.
- Spec kit version: tracked in [`00-README.md`](./00-README.md#versioning).

---

## 11. What an Opus (or any build agent) should do with this file

1. Read 00 → 02 → 14 to understand stack, layout, and milestones.
2. Identify which sprint's week you're working on.
3. Read the relevant spec files for that week's deliverables.
4. Implement. Run `yarn lint && yarn typecheck && yarn test` before
   every commit.
5. Open a PR. CI runs the full pipeline.
6. After 2 approvals + green CI, merge to main.
7. Tag with sprint number for release tracking.

If you finish a week's work early, pull from the next week. If you're
blocked, escalate to the project lead (the human in charge).

---

## 12. Final note

This is a complete spec kit. Every file referenced from another file
exists in this directory. Every value is pinned. Every contract is
specified. A build agent that reads this kit can take any single file
and produce a working module that integrates with the rest.

The 4-month sprint above is realistic for a small team (2–4 engineers)
or a single highly-disciplined engineer. With 10+ parallel agents
working in coordinated sprints, it could compress to 6–8 weeks.

The key risk is content production (50+ levels, 100+ levels): not
code. The code is well-specified here. The art and audio are not in
scope of this kit — they need separate work streams in Piskel, Tiled,
and a DAW.

**Go build.**
