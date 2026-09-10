# Olympian — Master Task Plan

> **The single source of truth for who builds what, in what order, and
> how to know it's done.** A build agent (or human) reads this file,
> finds the next task they can claim (matching their agent type, all
> dependencies met, status `pending`), and executes it.
>
> **Scope:** End-to-end construction of the Olympian mobile game, from
> empty repo to v1.0 store submission. Covers code, content, art, audio,
> test, and release.
>
> **Companion to:** [`00-README.md`](./00-README.md) (entry point),
> [`02-technical-architecture.md`](./02-technical-architecture.md)
> (stack decisions), [`14-build-test-and-milestones.md`](./14-build-test-and-milestones.md)
> (high-level sprint plan — this file is the detailed breakdown).

---

## How to use this file

1. **Find your agent type** in the "Agent roster" section.
2. **Scan the task index** for tasks assigned to your agent type with
   status `pending` and all `depends_on` tasks completed.
3. **Claim the task** by changing status from `pending` → `in_progress`
   and adding your session/agent id to `claimed_by`.
4. **Read the spec references** at the bottom of the task.
5. **Implement.** Run `yarn lint && yarn typecheck && yarn test` before
   every commit.
6. **Update status** to `done` when acceptance criteria are met.
7. **Move to the next unblocked task.**

Multiple agents can work in parallel as long as they don't claim the
same task or violate dependencies. There is no global scheduler — agents
self-coordinate by reading this file.

---

## 1. Conventions

### 1.1 Task ID format

`P{N}.E{M}.T{K}`

- `P{N}` = Phase (0–4)
- `E{M}` = Epic within phase (1, 2, 3, ...)
- `T{K}` = Task within epic (1, 2, 3, ...)

Example: `P2.E3.T4` = Phase 2, Epic 3, Task 4.

### 1.2 Status enum

| Status | Meaning |
|---|---|
| `pending` | Not started, all dependencies met → claimable |
| `blocked` | Not started, dependencies not met |
| `in_progress` | Currently being worked on (only 1 agent per task) |
| `in_review` | PR open, awaiting review |
| `done` | Merged + acceptance criteria verified |
| `cancelled` | Decided not to do (with reason) |

### 1.3 Agent roster

| Code | Agent type | Owns |
|---|---|---|
| `arch` | **Architect** | Repo scaffold, CI, scripts, ADR enforcement |
| `plat` | **Platform Engineer** | DB, MMKV, IAP, audio modules, locale, device APIs |
| `game` | **Game Systems Engineer** | ECS, combat, puzzle mechanics, AI, level loader |
| `gfx` | **Graphics Engineer** | Skia canvas, sprites, tiles, animations, particles |
| `ui` | **UI Engineer** | Components, screens, design tokens, navigation, RTL |
| `i18n` | **i18n Engineer** | Translations, RTL strategy, locale mgmt |
| `audio` | **Audio Engineer** | Music integration, SFX pool, mixer, ducking |
| `content` | **Content Author** | Level JSON, item catalog, enemy data, dialogue |
| `art` | **Pixel Artist** | Sprites, tiles, icons in Piskel |
| `audio-content` | **Audio Composer** | Music, ambience, SFX authoring |
| `qa` | **QA / Test Engineer** | Unit tests, e2e, perf checks, visual regression |
| `release` | **Release / DevOps** | Store submission, beta, marketing assets |
| `lead` | **Project Lead** (human) | Decisions, conflict resolution, code review |

### 1.4 Effort unit

Effort is in **person-hours** (1 person = 1 productive hour).

- `XS` = 1–2 hours
- `S` = 2–4 hours
- `M` = 4–8 hours (1 working day)
- `L` = 1–2 days
- `XL` = 3–5 days
- `XXL` = 1–2 weeks (split into subtasks if possible)

### 1.5 Acceptance criteria format

Every task has AC lines prefixed with `AC:`. Each AC is testable:

- `AC: yarn test passes for the new module`
- `AC: Feature X visible on iPhone 11 simulator`
- `AC: Schema validates against data/schemas/x.schema.json`

If you can verify the AC by running a command, write the command.

---

## 2. Phase overview

| Phase | Name | Duration | Goal | Demo |
|---|---|---|---|---|
| **P0** | Repo & Tooling | 3 days | Empty game boots, CI green | `yarn ios` shows a colored Skia canvas |
| **P1** | Foundation | 4 weeks | All infra layers wired, no gameplay | Navigate from title to settings, change language, hear SFX |
| **P2** | Vertical Slice | 4 weeks | 1 full Act playable (8 levels + boss) | Beat the Nemean Lion, see relic reward |
| **P3** | Content | 4 weeks | Acts 1–6 complete, 50 levels | Internal TestFlight, 3 hours of content |
| **P4** | Polish + Launch | 4 weeks | Acts 7–12 added, v1.0 ready, store submitted | App on App Store + Play Store |

Total: **~17 weeks** (4 months + 1 week). Compresses to ~10 weeks
with 10+ parallel agents.

---

## 3. Dependency graph (high-level)

```
P0 (Repo & Tooling)
  │
  ▼
P1.E1 (Platform) ─────┐
P1.E2 (Rendering) ────┤
P1.E3 (UI) ───────────┼─► P2 (Vertical Slice)
P1.E4 (Audio) ────────┤
P1.E5 (i18n) ─────────┘
  │
  ▼
P2.E1 (Hero & movement) ─┐
P2.E2 (One level) ───────┤
P2.E3 (First puzzle) ────┼─► P3 (Content)
P2.E4 (First boss) ──────┤
P2.E5 (Inventory) ───────┘
  │
  ▼
P3.E1–E6 (Acts 1–6) ─┐
P3.E7 (Combat polish)─┤
P3.E8 (Translation) ──┼─► P4 (Polish + Launch)
P3.E9 (Audio library)─┤
P3.E10 (Internal beta)┘
  │
  ▼
P4.E1–E6 (Acts 7–12) ─┐
P4.E7 (Accessibility)─┤
P4.E8 (Store assets) ─┼─► LAUNCH
P4.E9 (Closed beta) ──┤
P4.E10 (Submission) ──┘
```

---

## 4. Critical path (minimum to ship MVP at end of P2)

```
P0.T1 (scaffold) → P0.T2 (CI) → P1.E1.T1 (DB)
→ P1.E2.T1 (Skia) → P1.E3.T1 (tokens) → P1.E3.T4 (navigation)
→ P2.E1.T1 (hero sprite) → P2.E1.T3 (movement) → P2.E2.T1 (overworld)
→ P2.E3.T1 (reflex puzzle) → P2.E3.T3 (level clear) → P2.E4.T3 (boss phase 1)
→ P2.E4.T4 (boss phase 2) → P2.E4.T5 (boss clear) → DEMO
```

20 tasks. ~10 weeks sequential. This is the spine; everything else
branches off in parallel.

---

## 5. Phase 0 — Repo & Tooling (3 days)

**Goal:** Empty RN app boots on both platforms, CI is green, scripts
work locally. No game code yet.

### P0.E1 — Repo scaffold (1 day)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P0.E1.T1 | Initialize RN 0.76 Bare project (`npx react-native init Olympian`) | arch | S | — | 02 §1 |
| P0.E1.T2 | Set up `src/` folder structure per 02 §3 | arch | S | T1 | 02 §3 |
| P0.E1.T3 | Configure `tsconfig.json` strict + path aliases (`@/`) | arch | XS | T1 | 02 §11 |
| P0.E1.T4 | Configure `metro.config.js` and `babel.config.js` | arch | S | T1 | — |
| P0.E1.T5 | Configure `react-native.config.js` for asset links | arch | XS | T1 | — |
| P0.E1.T6 | Add ESLint + Prettier + typescript-eslint | arch | S | T1 | 02 §10 |
| P0.E1.T7 | Add Jest + @testing-library/react-native + babel-jest | qa | S | T1 | 14 §4 |
| P0.E1.T8 | Add Detox (iOS sim + Android emu configs) | qa | M | T1, T7 | 14 §4 |
| P0.E1.T9 | Add scripts dir + initial package.json scripts (lint, test, typecheck) | arch | S | T6, T7 | 14 §1.1 |

**AC for P0.E1:** `yarn install && yarn test` passes; `yarn ios` boots a
default RN app; `yarn android` boots same; `yarn lint` passes.

### P0.E2 — CI/CD (1 day)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P0.E2.T1 | Add `.github/workflows/ci.yml` (lint, test, build) | release | M | E1.T6, E1.T7 | 14 §5.1 |
| P0.E2.T2 | Add `.github/workflows/release.yml` (tag-triggered store upload) | release | M | E2.T1 | 14 §5.2 |
| P0.E2.T3 | Configure required secrets in GitHub | release | XS | T2 | 14 §5.3 |
| P0.E2.T4 | Add CODEOWNERS file (auto-assign reviewers by path) | release | XS | E1.T2 | — |
| P0.E2.T5 | Add branch protection rules on `main` (require CI + 1 review) | release | XS | E2.T1 | — |

**AC for P0.E2:** Push to a PR triggers CI; all green; required check
enforced.

### P0.E3 — Build scripts (1 day)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P0.E3.T1 | Implement `scripts/bake-assets.ts` skeleton (no-op for now) | arch | S | E1.T9 | 12 §6 |
| P0.E3.T2 | Implement `scripts/build-db.ts` skeleton | plat | S | E1.T9 | 03 §5.2 |
| P0.E3.T3 | Implement `scripts/validate-content.ts` (no-op) | plat | S | E1.T9 | 01 §12 |
| P0.E3.T4 | Implement `scripts/i18n-coverage.ts` (no-op) | i18n | S | E1.T9 | 10 §10 |
| P0.E3.T5 | Implement `scripts/perf-check.ts` (no-op) | release | S | E1.T9 | 02 §7 |
| P0.E3.T6 | Wire all scripts into `yarn prebuild` | arch | XS | T1–T5 | 14 §1.1 |

**AC for P0.E3:** `yarn prebuild` runs all 5 scripts and exits 0.

### P0.E4 — Dependency install (1 day)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P0.E4.T1 | Install RN core deps (React 18.3.1, RN 0.76.5) | arch | S | E1.T1 | 02 §11 |
| P0.E4.T2 | Install `@shopify/react-native-skia` + configure iOS Pods + Android | gfx | M | T1 | 02 §11 |
| P0.E4.T3 | Install `react-native-reanimated` + babel plugin | ui | S | T1 | 02 §11 |
| P0.E4.T4 | Install `react-native-gesture-handler` | ui | XS | T1 | 02 §11 |
| P0.E4.T5 | Install `@react-navigation/native` v7 + native-stack | ui | S | T1, T3, T4 | 02 §11 |
| P0.E4.T6 | Install `zustand` + `immer` | plat | XS | T1 | 02 §11 |
| P0.E4.T7 | Install `@op-engineering/op-sqlite` + iOS Pods | plat | M | T1 | 02 §11 |
| P0.E4.T8 | Install `react-native-mmkv` | plat | XS | T1 | 02 §11 |
| P0.E4.T9 | Install `react-native-iap` | plat | S | T1 | 02 §11 |
| P0.E4.T10 | Install i18n: `i18next`, `react-i18next`, `react-native-localize` | i18n | S | T1 | 02 §11 |
| P0.E4.T11 | Install audio: `react-native-sound`, `react-native-track-player` | audio | S | T1 | 02 §11 |
| P0.E4.T12 | Install `react-native-config` | plat | XS | T1 | 02 §11 |
| P0.E4.T13 | Install `@d11/react-native-fast-image` | gfx | S | T1 | 02 §11 |
| P0.E4.T14 | Pin all versions in `package.json` per 02 §11 | arch | XS | T1–T13 | 02 §11 |

**AC for P0.E4:** `yarn install` succeeds; `pod install` succeeds;
`yarn ios` and `yarn android` boot a hello-world app with all
libraries linked.

---

## 6. Phase 1 — Foundation (4 weeks)

**Goal:** Every infrastructure layer is in place. No gameplay yet, but
the app boots, navigates, persists data, renders a sprite, plays sound,
and respects locale.

### P1.E1 — Platform layer (DB, MMKV, IAP stubs, locale, device) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P1.E1.T1 | Implement `src/platform/storage/sqlite.ts` (op-sqlite wrapper, migration runner) | plat | L | P0.E4.T7 | 03 §3 |
| P1.E1.T2 | Implement migration v1 (all 14 tables from 03 §4) | plat | XL | T1 | 03 §4 |
| P1.E1.T3 | Implement `src/platform/storage/mmkv.ts` (instance + typed accessors) | plat | S | P0.E4.T8 | 02 §6.2 |
| P1.E1.T4 | Implement `src/platform/locale/locale.ts` (device locale detection) | i18n | S | P0.E4.T10 | 10 §2.1 |
| P1.E1.T5 | Implement `src/platform/device/device.ts` (screen size, refresh rate, safe area) | plat | S | P0.E4.T1 | 07 §2.2 |
| P1.E1.T6 | Implement `src/platform/haptics/haptics.ts` wrapper | plat | XS | P0.E4.T1 | 11 §7 |
| P1.E1.T7 | Implement `src/platform/iap/iapClient.ts` (init, fetchProducts, isOwned) | plat | L | P0.E4.T9 | 13 §4 |
| P1.E1.T8 | Write unit tests for DB migrations (apply, rollback not possible) | qa | M | T2 | 03 §3 |
| P1.E1.T9 | Write unit tests for MMKV (read, write, missing key) | qa | S | T3 | 02 §6.2 |
| P1.E1.T10 | Write unit tests for IAP client (mocked) | qa | M | T7 | 13 §10.2 |

**AC for P1.E1:** DB can be opened, schema applied, queries work;
MMKV persists across app restarts; IAP client connects and reports
empty ownership.

### P1.E2 — Rendering (Skia canvas, sprites, tiles) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P1.E2.T1 | Implement `src/game/render/canvas/GameCanvas.tsx` (root Skia canvas) | gfx | M | P0.E4.T2 | 07 §3.1 |
| P1.E2.T2 | Implement `src/game/render/sprites/SpriteSheet.ts` (load + rect lookup) | gfx | M | T1, P0.E4.T13 | 07 §3.3 |
| P1.E2.T3 | Implement `src/game/render/sprites/SpriteAnimator.ts` (frame-based, fps) | gfx | L | T2 | 07 §6.1 |
| P1.E2.T4 | Implement `src/game/render/canvas/Camera.ts` (position, follow, zoom) | gfx | M | T1 | 07 §3.5 |
| P1.E2.T5 | Implement `src/game/render/tiles/TileMap.ts` (Tiled JSON parser) | gfx | L | T1 | 07 §3.4 |
| P1.E2.T6 | Implement `src/game/render/tiles/TileRenderer.ts` (Skia draw with merging) | gfx | XL | T5, T4 | 07 §3.4 |
| P1.E2.T7 | Implement `src/game/render/effects/Particles.ts` (200-entity pool) | gfx | L | T3 | 07 §3.7 |
| P1.E2.T8 | Implement `src/game/render/effects/ScreenShake.ts` | gfx | S | T4 | 07 §3.6 |
| P1.E2.T9 | Implement `src/game/engine/loop/GameLoop.ts` (fixed-timestep, 60Hz) | game | M | T1 | 07 §2 |
| P1.E2.T10 | Implement draw list system (RenderSystem → DrawCommand[]) | game | L | T9 | 07 §3.2 |
| P1.E2.T11 | Write tests for SpriteAnimator (frame advance, loop, callback) | qa | M | T3 | 07 §6.1 |

**AC for P1.E2:** A 16×16 sprite renders in a 60Hz loop; a 10×10 tile
map renders correctly; camera follows a target.

### P1.E3 — UI layer (tokens, primitives, navigation, RTL) (1.5 weeks)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P1.E3.T1 | Implement `src/ui/theme/tokens.ts` (spacing, colors, typography, sizing) | ui | L | — | 05 §2 |
| P1.E3.T2 | Implement design tokens + theme provider | ui | M | T1 | 05 §2 |
| P1.E3.T3 | Implement `<View>` primitive (token-aware) | ui | S | T1 | 05 §3.1 |
| P1.E3.T4 | Implement `<Text>` primitive (variant, scale-aware) | ui | S | T1, P1.E1.T4 | 05 §3.2 |
| P1.E3.T5 | Implement `<Button>` (3 variants, 3 sizes, haptics) | ui | M | T1, T3, T4, P1.E1.T6 | 05 §3.3 |
| P1.E3.T6 | Implement `<Icon>` (sprite atlas lookup) | ui | M | T1, P1.E2.T2 | 05 §3.4 |
| P1.E3.T7 | Implement `<Input>` | ui | S | T3, T4 | 05 §3.5 |
| P1.E3.T8 | Implement `<Modal>` + `<Portal>` | ui | M | T3 | 05 §3.6 |
| P1.E3.T9 | Implement `<ProgressBar>` (Reanimated) | ui | S | T3, T4 | 05 §3.7 |
| P1.E3.T10 | Implement `<Card>`, `<ListItem>`, `<TabBar>`, `<Toast>`, `<StatBar>` | ui | XL | T3, T4 | 05 §4 |
| P1.E3.T11 | Implement navigation tree (06 §1) with native-stack | ui | L | T8, P0.E4.T5 | 06 §1 |
| P1.E3.T12 | Implement `BootGate` (splash + decision logic) | ui | M | T11, P1.E1.T1 | 06 §3 |
| P1.E3.T13 | Implement `LanguagePickerScreen` | ui | S | T4, T12 | 06 §2.1 |
| P1.E3.T14 | Implement `TitleScreen` (placeholder logo + buttons) | ui | S | T5, T11 | 06 §2.2 |
| P1.E3.T15 | Implement `SettingsScreen` (audio, language, accessibility) | ui | L | T11, P1.E1.T3 | 06 §2.12 |
| P1.E3.T16 | Wire RTL (logical props, I18nManager.forceRTL on locale change) | i18n | M | T4, T13 | 10 §4 |
| P1.E3.T17 | Write snapshot tests for all primitives | qa | L | T3–T10 | 05 §3 |
| P1.E3.T18 | Write snapshot tests for Settings + Title screens | qa | M | T14, T15 | 06 §2 |

**AC for P1.E3:** Navigate from title to settings; change language EN↔AR
and see RTL flip; toggle audio and persist; visual snapshots match.

### P1.E4 — Audio layer (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P1.E4.T1 | Implement `src/platform/audio/SfxPool.ts` (preload, play, recycle) | audio | L | P0.E4.T11 | 11 §3.4 |
| P1.E4.T2 | Implement `src/platform/audio/MusicPlayer.ts` (track-player, crossfade) | audio | XL | P0.E4.T11 | 11 §3.3 |
| P1.E4.T3 | Implement `src/platform/audio/AmbienceLayer.ts` (looping beds) | audio | M | T1 | 11 §3.5 |
| P1.E4.T4 | Implement `src/platform/audio/mixer.ts` (volume groups, ducking) | audio | M | T1, T2 | 11 §3.2 |
| P1.E4.T5 | Implement `src/platform/audio/preload.ts` (Act-aware preloading) | audio | M | T1, T2, T3 | 11 §5 |
| P1.E4.T6 | Implement public `audio` API in `index.ts` | audio | S | T1–T4 | 11 §3.2 |
| P1.E4.T7 | Wire audio into SettingsScreen (volume sliders) | ui | S | T6, P1.E3.T15 | 11 §6 |
| P1.E4.T8 | Add 1 test music track + 3 test SFX (placeholder content) | audio-content | S | T1, T2 | 11 §2 |
| P1.E4.T9 | Write unit tests for SfxPool, MusicPlayer, mixer | qa | L | T1, T2, T4 | 11 §11 |

**AC for P1.E4:** Setting music to 0 silences music; SFX play within
100ms of trigger; volume persists.

### P1.E5 — i18n + content seed (1 week, parallel with above)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P1.E5.T1 | Set up `src/i18n/index.ts` (i18next init, locale detection) | i18n | M | P0.E4.T10 | 10 §2.1 |
| P1.E5.T2 | Author English `common.json` (200 strings: buttons, errors, menus) | i18n | L | T1 | 10 §3 |
| P1.E5.T3 | Author English `ui.json` (300 strings: hub, settings, pause, modals) | i18n | L | T1 | 10 §3 |
| P1.E5.T4 | Author English `acts.json` (12 Acts × 5 fields = 60 strings) | i18n | M | T1 | 10 §3 |
| P1.E5.T5 | Author English `tutorial.json` (30 strings) | i18n | S | T1 | 10 §3 |
| P1.E5.T6 | Stub Arabic files (keys only, fallback to EN for MVP) | i18n | S | T1 | 10 §6 |
| P1.E5.T7 | Implement `applyRTL` and `mirroring.ts` helpers | i18n | M | T1, P1.E3.T16 | 10 §4 |
| P1.E5.T8 | Write i18n coverage test (every EN key has AR stub) | qa | S | T2–T6 | 10 §10 |
| P1.E5.T9 | Author seed JSON: `items.json` (50 items) | content | L | P1.E1.T2 | 03 §5 |
| P1.E5.T10 | Author seed JSON: `enemies.json` (14 enemy types) | content | L | T9 | 03 §5 |
| P1.E5.T11 | Author seed JSON: `companions.json` (4 companions) | content | S | T9 | 03 §5 |
| P1.E5.T12 | Author seed JSON: `acts.json` (12 Acts metadata) | content | M | T9 | 03 §5 |
| P1.E5.T13 | Author seed JSON: `iap_products.json` (2 placeholder products) | plat | XS | P1.E1.T7 | 13 §3 |
| P1.E5.T14 | Implement `scripts/seed-db.ts` (load seed JSON, insert into DB) | plat | M | P1.E1.T2, T9–T13 | 03 §5 |

**AC for P1.E5:** All UI text is i18n-keyed; switching locale works;
seed JSON validates; seed DB builds and includes all entries.

---

## 7. Phase 2 — Vertical Slice (4 weeks)

**Goal:** Act 1 fully playable end-to-end. One hero, one hub, one
overworld, 8 puzzle rooms, 1 boss. Save/load works. Death/respawn works.

### P2.E1 — Hero entity & movement (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E1.T1 | Author hero sprites: idle (4 dirs × 4 frames) | art | L | P1.E2.T2 | 01 §7.2 |
| P2.E1.T2 | Author hero sprites: walk (4 dirs × 6 frames) | art | L | T1 | 01 §7.2 |
| P2.E1.T3 | Author hero sprites: attack + hit + death | art | L | T1 | 01 §7.2 |
| P2.E1.T4 | Implement Hero entity factory in ECS (Position, Sprite, Animation, PlayerControlled) | game | M | T1, P1.E2.T3, P1.E2.T10 | 07 §1.3 |
| P2.E1.T5 | Implement `InputSystem` (read joystick, emit intent) | game | M | P1.E3.T5, T4 | 07 §1.5 |
| P2.E1.T6 | Implement `MovementSystem` (intent + velocity → position, collision check) | game | L | T4, T5 | 07 §1.5 |
| P2.E1.T7 | Implement `CameraSystem` (follow player with smooth lerp) | game | M | T4, P1.E2.T4 | 07 §1.5 |
| P2.E1.T8 | Implement `Joystick.tsx` (Reanimated, bottom-left) | ui | M | P0.E4.T3, P0.E4.T4 | 07 §4.1 |
| P2.E1.T9 | Wire joystick → inputStore → MovementSystem | game | S | T5, T6, T8 | 07 §4.1 |
| P2.E1.T10 | Implement `AnimationSystem` (advance frame, loop, callback) | game | M | T4, P1.E2.T3 | 07 §1.5 |
| P2.E1.T11 | Test: hero walks around, faces correct direction, animates | qa | S | T1–T10 | 07 §4 |

**AC for P2.E1:** Hero appears in scene, joystick moves them, camera
follows, animations play at 8fps.

### P2.E2 — One playable level (overworld + level transition) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E2.T1 | Author Act 1 overworld tilemap (256×192 tiles, in Tiled) | art | L | — | 01 §3.1 |
| P2.E2.T2 | Add 8 puzzle markers + 1 boss marker to overworld | content | S | T1 | 01 §3.1 |
| P2.E2.T3 | Implement `SceneManager.loadScene()` (entity creation, audio cross-fade) | game | L | P1.E2.T9, P1.E4.T2 | 07 §5 |
| P2.E2.T4 | Implement `Marker` component + tap-to-enter interaction | game | M | T2, P2.E1.T6 | 01 §3.1 |
| P2.E2.T5 | Implement `OverworldScreen` (loads Act 1 overworld scene) | ui | M | T3, P1.E3.T11 | 06 §2.7 |
| P2.E2.T6 | Implement `HubScreen` (placeholder: 1 button "Depart") | ui | S | T3, P1.E3.T11 | 06 §2.6 |
| P2.E2.T7 | Implement `LevelScreen` (loads puzzle scene, in-game HUD) | ui | S | T3, T5 | 06 §2.8 |
| P2.E2.T8 | Test: enter hub → depart → overworld → tap marker → enter level | qa | M | T5, T6, T7 | 06 §1 |

**AC for P2.E2:** Walking over a marker and tapping enters the level;
returning exits to the overworld.

### P2.E3 — First puzzle (Reflex mechanic) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E3.T1 | Author level JSON: `act1_area1_room1.json` (Reflex, tier 1) | content | S | P1.E5.T14 | 01 §6.3 |
| P2.E3.T2 | Implement `PuzzleMechanic` interface + registry | game | M | — | 08 §2 |
| P2.E3.T3 | Implement `ReflexPuzzle` class (config, state, step, isSolved, hint) | game | XL | T2 | 08 §3 |
| P2.E3.T4 | Implement `PuzzleManager` (start, step, hint, serialize) | game | L | T2, T3 | 08 §2.1 |
| P2.E3.T5 | Implement `PuzzleSystem` (per-tick, hooks into ECS) | game | M | T4 | 08 §2 |
| P2.E3.T6 | Implement `ReflexPuzzle.render()` (Skia: traps, avatar, timer) | gfx | L | T3, P1.E2.T1 | 08 §3.5 |
| P2.E3.T7 | Implement `PuzzleHUD` (timer bar, hearts) | ui | M | T3, P1.E3.T9 | 08 §3.5 |
| P2.E3.T8 | Implement tap-to-move in puzzle rooms (different from joystick) | game | M | P2.E1.T5 | 07 §4.3 |
| P2.E3.T9 | Author 1 Reflex sprite sheet (avatar + trap) | art | S | P1.E2.T2 | 08 §3.5 |
| P2.E3.T10 | Implement `LevelClearModal` (stars, rewards, continue) | ui | M | P1.E3.T8, T7 | 06 §2.16 |
| P2.E3.T11 | Implement `LevelFailModal` (out of attempts, retry/skip) | ui | S | P1.E3.T8 | 06 §2.17 |
| P2.E3.T12 | Wire level clear → save progress in DB | game | S | T10, P1.E4.T1 | 04 §4.4 |
| P2.E3.T13 | Test: solve Reflex puzzle, see clear modal, progress saved | qa | M | T1–T12 | 08 §12 |

**AC for P2.E3:** Tap avatar, move on grid, reach end, see clear
modal, exit and progress shows in DB.

### P2.E4 — First boss (Nemean Lion) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E4.T1 | Author Nemean Lion sprites: idle, attack, hit, death | art | L | — | 09 §3.7 |
| P2.E4.T2 | Implement `BossSpec` type and registry | game | S | — | 09 §3.7 |
| P2.E4.T3 | Implement `CombatSystem` (turn order, action queue) | game | XL | P2.E3.T5 | 09 §3 |
| P2.E4.T4 | Implement `EnemyAI` (aggressive script) | game | M | T3 | 09 §3.6 |
| P2.E4.T5 | Implement `damage.ts` (formula from 09 §3.4) | game | M | T3 | 09 §3.4 |
| P2.E4.T6 | Implement `HealthSystem` (regen, invuln, death check) | game | M | T3 | 09 §3.5 |
| P2.E4.T7 | Implement `CombatUI` (action menu, turn order, HP bars) | ui | L | T3, P1.E3.T5, T10 | 09 §7.4 |
| P2.E4.T8 | Implement `BossScreen` (loads boss scene, combat+puzzle fusion) | ui | M | T7, P2.E2.T7 | 06 §2.9 |
| P2.E4.T9 | Implement boss phase 1 (HP-based attack loop) | game | L | T3, T4, T5, T6 | 09 §3.7 |
| P2.E4.T10 | Implement boss phase 2 (invulnerable + Reflex mini-puzzle) | game | L | T9, P2.E3.T3 | 08 §9 |
| P2.E4.T11 | Implement `BossDefeatedModal` (VFX, rewards) | ui | M | P1.E3.T8 | 06 §2.18 |
| P2.E4.T12 | Wire boss defeat → grant relic → save → return to overworld | game | S | T11, P1.E4.T1 | 04 §4.4 |
| P2.E4.T13 | Test: full boss fight (combat → puzzle → kill → reward) | qa | L | T1–T12 | 09 §10 |

**AC for P2.E4:** Fight the Nemean Lion, see combat, see phase 2
puzzle, win, see relic reward modal, return to overworld with
Nemean Lion defeated.

### P2.E5 — Inventory basics (0.5 week, parallel with E4)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E5.T1 | Implement `inventoryStore` (Zustand) | game | M | P1.E1.T2, P1.E1.T3 | 04 §3.3 |
| P2.E5.T2 | Implement pickup detection in overworld + levels | game | S | T1, P2.E1.T6 | 09 §4 |
| P2.E5.T3 | Implement `InventoryModal` (32-slot grid, detail panel) | ui | L | T1, P1.E3.T10 | 06 §2.13 |
| P2.E5.T4 | Implement equip/unequip flow (DB write, stat update) | game | M | T1, P2.E4.T5 | 09 §4.4 |
| P2.E5.T5 | Implement `useConsumable` action (heal potion mid-combat) | game | S | T4 | 09 §5.2 |
| P2.E5.T6 | Author 10 consumable items in `items.json` (potions, scrolls) | content | S | P1.E5.T9 | 09 §5 |
| P2.E5.T7 | Test: pickup → equip → stat reflects → use in combat | qa | M | T1–T6 | 09 §10 |

**AC for P2.E5:** Pick up a potion, see it in inventory, equip a
weapon, see ATK go up in HUD, use potion in combat, see HP heal.

### P2.E6 — Full Act 1 content (1.5 weeks, parallel with E4+E5)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E6.T1 | Author 6 area tilemaps for Act 1 (8 sub-areas = 8 rooms) | art | XL | P2.E2.T1 | 01 §6 |
| P2.E6.T2 | Author 8 level JSONs (Act 1, all 6 mechanics represented) | content | XL | P2.E3.T1, P2.E4 | 01 §6.3 |
| P2.E6.T3 | Author 1 enemy sprite set (basic enemy) | art | M | — | 09 §3.6 |
| P2.E6.T4 | Author 1 basic enemy AI + stats in `enemies.json` | content | S | T3 | 09 §3.6 |
| P2.E6.T5 | Implement remaining 5 puzzle mechanics (Sequence, Path, Timing, Logic, Maze) | game | XXL | P2.E3.T3 | 08 §4–8 |
| P2.E6.T6 | Author 1 intro cinematic (Skia animation, 30s) | art | L | P1.E2.T7 | 01 §9 |
| P2.E6.T7 | Implement `IntroCinematicScreen` | ui | M | T6, P1.E3.T11 | 06 §2.3 |
| P2.E6.T8 | Implement `CompanionJoinModal` (Athena's intro on prologue end) | ui | S | P1.E3.T8 | 06 §2.19 |
| P2.E6.T9 | Implement `Athena` companion entity (stats, abilities) | game | M | P1.E5.T11 | 09 §7.2 |
| P2.E6.T10 | Implement party management (hero + 1 companion) | game | M | T9 | 09 §7.3 |
| P2.E6.T11 | Test: full Act 1 playthrough end-to-end (1.5 hours) | qa | XL | T1–T10 | 01 §9 |

**AC for P2.E6:** From title screen, play through Act 1's 8 levels
and boss, see all 6 puzzle mechanics, recruit Athena, beat the lion,
return to hub. Save file persists across app restart.

### P2.E7 — Demo & stakeholder review (end of P2)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P2.E7.T1 | Record demo video (15 min walkthrough) | release | M | E6.T11 | 14 §1 |
| P2.E7.T2 | Document known issues and P3 backlog | lead | S | qa reports | — |
| P2.E7.T3 | Stakeholder demo meeting (1 hour) | lead | S | T1, T2 | — |

**AC for P2.E7:** Demo video viewed by stakeholders; P3 plan approved
or revised.

---

## 8. Phase 3 — Content (4 weeks)

**Goal:** Acts 1–6 fully playable, 50 levels, 14 enemy types, all
RPG systems, full Arabic translation, full audio library. Internal
TestFlight build.

### P3.E1 — Acts 2–3 content (16 levels, 2 bosses) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E1.T1 | Author Act 2 area tilemaps (8 sub-areas) | art | L | P2.E6.T1 | 01 §6 |
| P3.E1.T2 | Author Act 2 level JSONs (16 puzzles) | content | XL | P2.E6.T5 | 01 §6.3 |
| P3.E1.T3 | Implement Lernaean Hydra boss (Sequence mechanic phase 2) | game | XL | P2.E4.T10 | 09 §3.7 |
| P3.E1.T4 | Author Hydra sprites (9 heads, idle + attack + hit) | art | L | — | 01 §2.1 |
| P3.E1.T5 | Implement 3 Act 2 enemies (poison snake, swamp leech, bog wraith) | game+art+content | L each | P2.E6.T4 | 09 §3.6 |
| P3.E1.T6 | Author Act 3 area tilemaps (8 sub-areas) | art | L | T1 | 01 §6 |
| P3.E1.T7 | Author Act 3 level JSONs (16 puzzles, Path-focused) | content | XL | T1 | 01 §6.3 |
| P3.E1.T8 | Implement Ceryneian Hind boss (companion join) | game | XL | T3 | 09 §7.1 |
| P3.E1.T9 | Author Hind sprites (deer form) | art | L | — | 09 §7.2 |
| P3.E1.T10 | Implement 3 Act 3 enemies (forest sprite, bramble wolf, dryad) | game+art+content | L each | T5 | 09 §3.6 |
| P3.E1.T11 | Test: full Act 2 + 3 playthroughs | qa | XL | T1–T10 | 01 §3.1 |

### P3.E2 — Acts 4–5 content (16 levels, 2 bosses) (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E2.T1 | Author Act 4 area tilemaps (8 sub-areas, snowy) | art | L | E1.T1 | 01 §6 |
| P3.E2.T2 | Author Act 4 level JSONs (16 puzzles, Timing-focused) | content | XL | E1.T2 | 01 §6.3 |
| P3.E2.T3 | Implement Erymanthian Boar boss (Timing phase 2) | game | XL | E1.T3 | 09 §3.7 |
| P3.E2.T4 | Author Boar sprites | art | L | — | 01 §2.1 |
| P3.E2.T5 | Implement 3 Act 4 enemies | game+art+content | L each | E1.T5 | 09 §3.6 |
| P3.E2.T6 | Author Act 5 area tilemaps (8 sub-areas, stables) | art | L | T1 | 01 §6 |
| P3.E2.T7 | Author Act 5 level JSONs (16 puzzles, Logic-focused) | content | XL | T1 | 01 §6.3 |
| P3.E2.T8 | Implement Augeas boss (Logic phase 2, scripted dialogue) | game | XL | E1.T3 | 09 §3.7 |
| P3.E2.T9 | Author Augeas sprites (king NPC) | art | L | — | 01 §2.1 |
| P3.E2.T10 | Implement 2 Act 5 enemies | game+art+content | M each | T5 | 09 §3.6 |
| P3.E2.T11 | Test: full Act 4 + 5 playthroughs | qa | XL | T1–T10 | 01 §3.1 |

### P3.E3 — Act 6 content (8 levels, 1 boss) (0.5 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E3.T1 | Author Act 6 area tilemaps (8 sub-areas, marsh) | art | M | E2.T1 | 01 §6 |
| P3.E3.T2 | Author Act 6 level JSONs (8 puzzles, Refraction-focused) | content | L | E2.T2 | 01 §6.3 |
| P3.E3.T3 | Implement Stymphalian Birds boss (Refraction phase 2) | game | XL | E2.T3 | 09 §3.7 |
| P3.E3.T4 | Author Birds sprites (swan-like) | art | M | — | 01 §2.1 |
| P3.E3.T5 | Implement 2 Act 6 enemies | game+art+content | M each | E2.T5 | 09 §3.6 |
| P3.E3.T6 | Test: full Act 6 playthrough | qa | L | T1–T5 | 01 §3.1 |

### P3.E4 — Full RPG systems (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E4.T1 | Implement `leveling.ts` (XP curve, level-up flow) | game | M | — | 09 §2.1 |
| P3.E4.T2 | Implement stat growth + level-up modal (3 random offers) | game | M | T1, P1.E3.T8 | 09 §2.2 |
| P3.E4.T3 | Implement respec flow (respec_tokens, refund) | game | M | T2 | 09 §2.3 |
| P3.E4.T4 | Author 4 skills per character (16 total) in `skills.json` | content | L | — | 09 §6 |
| P3.E4.T5 | Implement skill execution in CombatSystem | game | XL | T4, P2.E4.T3 | 09 §6.2 |
| P3.E4.T6 | Implement MP system (max_mp, regen, costs) | game | M | T5 | 09 §6.3 |
| P3.E4.T7 | Implement status effects (poison, burn, stun, regen, def+) | game | L | T5 | 09 §3.3 |
| P3.E4.T8 | Implement item effects (stat_mod, heal_on_hit, resistance) | game | L | T7 | 09 §4.3 |
| P3.E4.T9 | Implement loot drop rolling + drop table parsing | game | M | P1.E5.T9 | 09 §3 |
| P3.E4.T10 | Author 50 more items in `items.json` (weapons, armor, trinkets) | content | XL | T8, T9 | 09 §4.1 |
| P3.E4.T11 | Test: full RPG loop (level up, equip, skill, loot, status effects) | qa | XL | T1–T10 | 09 §10 |

### P3.E5 — Combat polish (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E5.T1 | Author attack animations for all 14 enemy types | art | XL | — | 09 §3 |
| P3.E5.T2 | Implement hit-stun + knockback in CombatSystem | game | M | P2.E4.T3 | 09 §3.3 |
| P3.E5.T3 | Implement floating combat text (damage numbers) | gfx | M | P1.E2.T1 | 09 §3.4 |
| P3.E5.T4 | Implement combat VFX (slash, magic burst, heal glow) | gfx | L | T3, P1.E2.T7 | 09 §3 |
| P3.E5.T5 | Implement screen shake on big hits | gfx | S | P1.E2.T8, T2 | 07 §3.6 |
| P3.E5.T6 | Implement sound effects for combat (60 SFX total) | audio-content | XL | P1.E4.T1 | 11 §2.3 |
| P3.E5.T7 | Wire all combat SFX into CombatSystem | audio | M | T6 | 11 §4.1 |
| P3.E5.T8 | Test: combat feel (visual + audio + haptics) | qa | L | T1–T7 | 09 §10 |

### P3.E6 — Full Arabic translation (1 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E6.T1 | Hire Arabic translator (Upwork/Fiverr, 5-day turnaround) | lead | M | — | 10 §1 |
| P3.E6.T2 | Send all English JSON files to translator with style guide | i18n | S | T1 | 10 §8 |
| P3.E6.T3 | Integrate translated Arabic JSON files | i18n | S | T2 | 10 §1 |
| P3.E6.T4 | Test: switch to AR, verify every key resolves, no fallback to EN | qa | L | T3 | 10 §10 |
| P3.E6.T5 | Author Arabic-specific font config (Amiri for display) | i18n | S | T3 | 10 §4.5 |
| P3.E6.T6 | Test RTL on every screen (visual + screenshot) | qa | XL | T5 | 10 §4 |

### P3.E7 — Full audio library (1 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E7.T1 | Compose Act 1–6 music (6 tracks × 2.5 min, chiptune) | audio-content | XXL | — | 11 §2.1 |
| P3.E7.T2 | Compose Act 1–6 ambience (6 loops, 1 min each) | audio-content | XL | — | 11 §2.2 |
| P3.E7.T3 | Author music manifest (track → Act mapping) | audio-content | S | T1 | 11 §9.1 |
| P3.E7.T4 | Wire all music into SceneManager | audio | M | T3, P2.E2.T3 | 11 §4.2 |
| P3.E7.T5 | Test: each Act plays correct music + ambience, no overlap | qa | L | T4 | 11 §11 |

### P3.E8 — Persistence hardening (0.5 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E8.T1 | Implement `saveManager.hydrate()` (full snapshot) | plat | L | P1.E1.T2, P1.E1.T3 | 04 §4.1 |
| P3.E8.T2 | Implement `saveManager.flushAll()` (sync, on app background) | plat | M | T1 | 04 §4.4 |
| P3.E8.T3 | Implement SHA-256 checksum on saves | plat | M | T1 | 04 §4.3 |
| P3.E8.T4 | Implement corruption recovery (fallback to last auto-save) | plat | M | T3 | 04 §4.3 |
| P3.E8.T5 | Implement `eventLog` (append-only, rotation at 10k rows) | plat | L | P1.E1.T2 | 04 §5 |
| P3.E8.T6 | Wire all stores to debounced/throttled writes | plat | L | T1, T2 | 04 §4.2 |
| P3.E8.T7 | Test: save/load 100x, no corruption, performance OK | qa | L | T1–T6 | 04 §10 |

### P3.E9 — Internal playtest build (0.5 week, end of P3)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P3.E9.T1 | Build iOS release (TestFlight) | release | M | E1–E8 | 14 §5.2 |
| P3.E9.T2 | Build Android release (Play internal) | release | M | T1 | 14 §5.2 |
| P3.E9.T3 | Recruit 10 internal playtesters (TestFlight + Play internal) | lead | M | T1, T2 | 14 §6 |
| P3.E9.T4 | Send playtest instructions (focus areas, bug report template) | lead | S | T3 | 14 §6 |
| P3.E9.T5 | Collect playtest data (D1 retention, session length, level completion) | lead | XL | T3 (ongoing) | 01 §13 |
| P3.E9.T6 | Triage playtest bugs, prioritize for P4 | lead | L | T5 | 14 §1 |

**AC for P3:** Internal testers can play Acts 1–6 (50 levels, 6 bosses)
end-to-end. Save/load is robust. Full Arabic translation. Full audio.
Telemetry (manual, not yet automated) shows the loop is engaging.

---

## 9. Phase 4 — Polish + Launch (4 weeks)

**Goal:** Acts 7–12 added (50 more levels), accessibility features,
store assets, store submission. v1.0 launches.

### P4.E1 — Acts 7–9 content (24 levels, 3 bosses) (1.5 weeks)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E1.T1 | Author Act 7 area tilemaps (Labyrinth of Knossos) | art | L | P3.E1.T1 | 01 §6 |
| P4.E1.T2 | Author Act 7 level JSONs (12 puzzles, Maze-focused) | content | XL | T1 | 01 §6.3 |
| P4.E1.T3 | Implement Minotaur boss (Maze phase 2) | game | XL | P2.E4.T10 | 09 §3.7 |
| P4.E1.T4 | Author Minotaur sprites | art | L | — | 01 §2.1 |
| P4.E1.T5 | Author Act 8 area tilemaps (Thracian stables) | art | L | T1 | 01 §6 |
| P4.E1.T6 | Author Act 8 level JSONs (8 puzzles) | content | L | T5 | 01 §6.3 |
| P4.E1.T7 | Implement Diomedes' Mares boss (Logic phase 2) | game | XL | T3 | 09 §3.7 |
| P4.E1.T8 | Author Act 9 area tilemaps (Amazon territory) | art | L | T5 | 01 §6 |
| P4.E1.T9 | Author Act 9 level JSONs (8 puzzles) | content | L | T8 | 01 §6.3 |
| P4.E1.T10 | Implement Hippolyta boss (companion join + War Cry) | game | XL | T7 | 09 §7.1 |
| P4.E1.T11 | Author Hippolyta sprites | art | L | — | 09 §7.2 |
| P4.E1.T12 | Test: full Act 7–9 playthroughs | qa | XL | T1–T11 | 01 §3.1 |

### P4.E2 — Acts 10–12 content (26 levels, 3 bosses + finale) (2 weeks)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E2.T1 | Author Act 10 area tilemaps (Three Islands) | art | L | E1.T1 | 01 §6 |
| P4.E2.T2 | Author Act 10 level JSONs (8 puzzles) | content | L | T1 | 01 §6.3 |
| P4.E2.T3 | Implement Geryon boss (three-bodied, multi-phase) | game | XL | E1.T3 | 09 §3.7 |
| P4.E2.T4 | Author Act 11 area tilemaps (Twilight Garden) | art | L | T1 | 01 §6 |
| P4.E2.T5 | Author Act 11 level JSONs (8 puzzles) | content | L | T4 | 01 §6.3 |
| P4.E2.T6 | Implement Ladon (dragon) boss + Apple reward | game | XL | T3 | 09 §3.7 |
| P4.E2.T7 | Implement Orpheus hidden companion (Act 11 secret area) | game | L | T6 | 09 §7.1 |
| P4.E2.T8 | Author Act 12 area tilemaps (Underworld, dark theme) | art | XL | T4 | 01 §6 |
| P4.E2.T9 | Author Act 12 level JSONs (10 puzzles, finale-longer) | content | XL | T8 | 01 §6.3 |
| P4.E2.T10 | Implement Cerberus final boss (all 6 mechanics fused) | game | XXL | T3, T6 | 09 §3.7 |
| P4.E2.T11 | Implement Hades post-boss scene + ending cinematic | game+art | XL | T10, P1.E2.T7 | 01 §2.1 |
| P4.E2.T12 | Implement pillar restoration ending (story beat) | game | M | T11 | 01 §2 |
| P4.E2.T13 | Test: full Act 10–12 playthrough including ending | qa | XXL | T1–T12 | 01 §3.1 |

### P4.E3 — Music + ambience for Acts 7–12 (0.5 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E3.T1 | Compose Act 7–12 music (6 tracks) | audio-content | XXL | P3.E7.T1 | 11 §2.1 |
| P4.E3.T2 | Compose boss theme + victory fanfare | audio-content | M | T1 | 11 §2.1 |
| P4.E3.T3 | Wire all new music into SceneManager | audio | M | T1, T2, P2.E2.T3 | 11 §4.2 |
| P4.E3.T4 | Test: each Act plays correct music | qa | M | T3 | 11 §11 |

### P4.E4 — Accessibility (1 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E4.T1 | Implement text scale (100/125/150/200%) | ui | M | P1.E3.T4, P1.E3.T15 | 05 §3.2 |
| P4.E4.T2 | Implement color-blind modes (Protan, Deutan, Tritan) | gfx | L | P1.E2.T1, 12 §3 | 12 §3 |
| P4.E4.T3 | Implement reduce-motion flag (disable shake, particles, parallax) | gfx | M | P1.E2.T7, P1.E2.T8 | 05 §2.7 |
| P4.E4.T4 | Implement one-handed mode (UI bottom-half only) | ui | L | P1.E3.T11, P2.E1.T8 | 05 §11 |
| P4.E4.T5 | Implement left-handed mode (mirror controls) | ui | M | P2.E1.T8, T4 | 07 §4.1 |
| P4.E4.T6 | Author 3 color-blind palette mappings | art | M | 12 §3 | 12 §3 |
| P4.E4.T7 | Add accessibility labels to all interactive components | ui | L | P1.E3.T3–T10 | 05 §8.1 |
| P4.E4.T8 | Test: every accessibility feature toggles correctly | qa | XL | T1–T7 | 05 §11 |

### P4.E5 — i18n expansion (0.5 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E5.T1 | Stub ES + DE locale files (keys only) | i18n | S | P1.E5.T6 | 10 §6 |
| P4.E5.T2 | Implement locale-picker in Settings (4 languages visible) | ui | S | T1, P1.E3.T15 | 10 §2 |
| P4.E5.T3 | Hire ES + DE translators (post-MVP, ship stubs at v1.0) | lead | M | T1 | 10 §6 |
| P4.E5.T4 | Test: switching to ES/DE shows English fallback (no crash) | qa | S | T2 | 10 §10 |

### P4.E6 — Performance tuning (1 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E6.T1 | Run `yarn perf:check` on Pixel 4a / iPhone 11 | gfx | M | P3.E1–E3 done | 02 §7 |
| P4.E6.T2 | Profile Skia draw calls (target <500 per frame) | gfx | M | T1 | 07 §8 |
| P4.E6.T3 | Profile JS thread tick (target <8ms p95) | game | M | T1 | 07 §2.2 |
| P4.E6.T4 | Implement entity culling (off-camera entities skipped) | game | M | P1.E2.T10, T1 | 07 §8 |
| P4.E6.T5 | Implement LOD for far enemies (static sprite, no anim) | gfx | M | T1, P1.E2.T3 | 07 §8 |
| P4.E6.T6 | Profile cold start (target <2.5s) | plat | M | T1 | 02 §7 |
| P4.E6.T7 | Profile app size (target <80 MB) | release | S | T1 | 02 §7 |
| P4.E6.T8 | Fix any perf issues found | varies | L | T1–T7 | — |
| P4.E6.T9 | Run `yarn perf:check` again, verify all budgets met | release | S | T8 | 02 §7 |

### P4.E7 — App store assets (0.5 week, parallel)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E7.T1 | Author app icon (1024×1024) | art | M | — | 14 §8 |
| P4.E7.T2 | Author app store screenshots (6.5", 5.5" iOS, 5 per locale) | art | L | P3.E1–E3 | 14 §8 |
| P4.E7.T3 | Author app store description (EN + AR) | lead | M | P3.E6 done | 14 §8 |
| P4.E7.T4 | Create privacy policy page (olympian.com/privacy) | lead | XS | — | 14 §8 |
| P4.E7.T5 | Create terms of service page | lead | XS | — | 14 §8 |
| P4.E7.T6 | Author feature graphic (1024×500, Android) | art | S | T1 | 14 §8 |
| P4.E7.T7 | Author trailer video (60s) | release | XL | P3 done | 14 §8 |
| P4.E7.T8 | Complete data safety forms (Apple + Google) | lead | S | T4 | 14 §8 |

### P4.E8 — Closed beta (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E8.T1 | Build closed beta (TestFlight + Play internal) | release | M | E1–E7 | 14 §5.2 |
| P4.E8.T2 | Recruit 30 closed beta testers (mix of iOS + Android) | lead | M | T1 | 14 §6 |
| P4.E8.T3 | Distribute beta build + feedback form | lead | S | T2 | 14 §6 |
| P4.E8.T4 | Monitor crash reports (manual, no Sentry yet) | release | XL | T1 (ongoing) | 14 §1 |
| P4.E8.T5 | Triage beta feedback + crash reports | lead | XL | T3, T4 (ongoing) | 14 §1 |
| P4.E8.T6 | Fix P0/P1 bugs found | varies | XL | T5 | — |
| P4.E8.T7 | Re-build and re-distribute | release | M | T6 | 14 §5.2 |

### P4.E9 — Store submission (1 week)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E9.T1 | App Store Connect: complete app record, upload build | release | M | E7, E8 | 14 §8 |
| P4.E9.T2 | Google Play Console: complete app record, upload bundle | release | M | T1 | 14 §8 |
| P4.E9.T3 | Submit for review (App Store) | release | S | T1 | 14 §8 |
| P4.E9.T4 | Submit for review (Google Play) | release | S | T2 | 14 §8 |
| P4.E9.T5 | Address any review feedback | release | M | T3, T4 (async) | 14 §1 |
| P4.E9.T6 | Final QA pass on production build | qa | L | T3, T4 | 14 §1 |
| P4.E9.T7 | Schedule public release date | lead | S | T3, T4 | 14 §8 |
| P4.E9.T8 | Press kit + launch announcement | release | M | T7 | 14 §1 |
| P4.E9.T9 | LAUNCH 🚀 | lead | — | T7 | 14 §1 |

**AC for P4:** App available on App Store + Google Play. All 100 levels
playable. All 6 puzzle mechanics. Full Arabic. Accessibility
features. Internal playtest data shows D1 ≥ 40%, D7 ≥ 18%.

### P4.E10 — Post-launch monitoring (ongoing, this phase only)

| ID | Title | Agent | Effort | Depends on | Spec ref |
|---|---|---|---|---|---|
| P4.E10.T1 | Monitor store reviews daily (week 1) | lead | M | E9.T7 | 14 §9 |
| P4.E10.T2 | Triage crash reports from beta → production | release | M | T1 | 14 §9 |
| P4.E10.T3 | Hotfix v1.0.1 if critical bugs found | varies | varies | T2 | 14 §9 |
| P4.E10.T4 | Plan v1.1 (post-launch content: cloud save, daily quests) | lead | M | T3 | 14 §9 |

---

## 10. Cross-cutting tasks (run throughout)

These are not in a single phase; they recur.

### 10.1 Test authoring (qa, ongoing)

- Every code task should land with unit tests. qa agent reviews test
  coverage per PR.
- E2E tests (Detox) are added per phase:
  - End of P2: 3 critical flows
  - End of P3: 7 critical flows
  - End of P4: 10 critical flows
- Visual regression snapshots: per major screen, 1 baseline.
- Perf checks: end of each phase, automated in CI.

### 10.2 Documentation (lead, ongoing)

- README updated as the project evolves
- `docs/spec-kit/` updated whenever an ADR changes
- Inline JSDoc on all exported functions
- Changelog file, updated per release

### 10.3 Security review (lead, end of each phase)

- No secrets in repo (CI check)
- No telemetry/analytics leaking data
- Save file integrity (checksum verified)
- IAP receipt validation (when implemented)

### 10.4 Performance budgets (release, end of each phase)

- `yarn perf:check` runs in CI
- Bundle size, asset size, cold start measured
- Any budget over → block release

---

## 11. Risk tasks (do these early)

These are the highest-uncertainty items. Build agents should claim
them ASAP to surface issues.

| ID | Title | Why risky | Mitigation |
|---|---|---|---|
| P0.E4.T2 | Skia + RN 0.76 install | Version compat issues | Spike in P0 day 1 |
| P1.E2.T6 | TileRenderer with merging | Complex Skia batching | Defer to L if needed |
| P1.E3.T16 | RTL with all components | Bugs in custom components | Storybook + visual regression |
| P2.E1.T6 | MovementSystem + collision | Edge cases (corners, walls) | Test suite for 20 collision cases |
| P2.E3.T3 | First puzzle (Reflex) | Many unknowns in puzzle system | Get this right, copy pattern for other 5 |
| P2.E4.T3 | Combat system | Highest complexity in game | Phased implementation, 2 weeks for full |
| P2.E6.T5 | 5 remaining puzzle mechanics | 5 × XL = 12 weeks if naive | Reuse ReflexPuzzle pattern aggressively |
| P3.E1.T3 | Boss with phase 2 (any) | Pattern needs to be reusable | Build Nemean Lion first, copy |
| P3.E5.5T6 | 60 SFX in 1 week | Audio content production rate | Pre-schedule with composer |

---

## 12. Per-agent playbook (claim-by-claim)

### 12.1 `arch` (Architect)

**Owns:** Repo scaffold, scripts, CI, ADRs.

**Tasks:** All of P0.E1, P0.E2, P0.E3, P0.E4.T14, plus code review.

**Day-1 claim:** P0.E1.T1.

### 12.2 `plat` (Platform Engineer)

**Owns:** DB, MMKV, IAP, audio modules, locale, device APIs.

**Tasks:** P1.E1.T1–T10, P1.E5.T13–T14, P3.E8.T1–T7, P4.E6.T6.

**Day-1 claim:** P1.E1.T1.

### 12.3 `game` (Game Systems Engineer)

**Owns:** ECS, combat, puzzles, AI, level loader.

**Tasks:** P2.E1.T4–T7, T9–T10, P2.E2.T3–T4, P2.E3.T2–T5, T8, T12, P2.E4.T2–T6, T9–T10, T12, P2.E5.T1–T2, T4–T5, P2.E6.T5, T9–T10, P3.E1.T3, T5, T8, T10, P3.E2.T3, T5, T7, T10, P3.E3.T3, T5, P3.E4.T1–T9, P4.E1.T3, T7, T10, P4.E2.T3, T6–T7, T10–T12.

**Day-1 claim:** P1.E2.T9 (game loop) or P2.E1.T4 (hero entity).

### 12.4 `gfx` (Graphics Engineer)

**Owns:** Skia canvas, sprites, tiles, animations, particles.

**Tasks:** P1.E2.T1–T11, P2.E3.T6, P3.E5.T3–T5, P4.E4.T2–T3, T5, P4.E6.T1–T5, T8.

**Day-1 claim:** P1.E2.T1.

### 12.5 `ui` (UI Engineer)

**Owns:** Components, screens, design tokens, navigation.

**Tasks:** P1.E3.T1–T18, P1.E4.T7, P2.E1.T8, P2.E2.T5–T7, P2.E3.T7, T10–T11, P2.E4.T7–T8, T11, P2.E5.T3, P2.E6.T7, P4.E4.T1, T4–T5, T7, P4.E5.T2.

**Day-1 claim:** P1.E3.T1.

### 12.6 `i18n` (i18n Engineer)

**Owns:** Translations, RTL, locale.

**Tasks:** P1.E1.T4, P1.E3.T16, P1.E5.T1–T8, P3.E6.T2–T6, P4.E5.T1–T2.

**Day-1 claim:** P1.E5.T1.

### 12.7 `audio` (Audio Engineer)

**Owns:** Music player, SFX pool, mixer, integration.

**Tasks:** P1.E4.T1–T7, T9, P3.E5.T7, P3.E7.T4, P4.E3.T3.

**Day-1 claim:** P1.E4.T1.

### 12.8 `content` (Content Author)

**Owns:** Level JSON, items, enemies, dialogue, IAP catalog.

**Tasks:** P1.E5.T9–T12, P2.E2.T2, P2.E3.T1, P2.E5.T6, P2.E6.T2, T4, P3.E4.T4, T10, all P3.E1/E2/E3 content, P4.E1/E2 content, P4.E5 stub.

**Day-1 claim:** P1.E5.T9.

### 12.9 `art` (Pixel Artist)

**Owns:** All sprite work in Piskel.

**Tasks:** P2.E1.T1–T3, P2.E3.T9, P2.E4.T1, P2.E6.T1, T3, T6, P3.E1.T1, T4, T9, P3.E2.T1, T4, T9, P3.E3.T1, T4, P3.E5.T1, P4.E1.T1, T4, T5, T8, T11, P4.E2.T1, T4, T8, P4.E4.T6, P4.E7.T1–T2, T6.

**Day-1 claim:** P2.E1.T1.

### 12.10 `audio-content` (Audio Composer)

**Owns:** Music, ambience, SFX authoring.

**Tasks:** P1.E4.T8, P3.E5.T6, P3.E7.T1–T3, P4.E3.T1–T2.

**Day-1 claim:** P1.E4.T8.

### 12.11 `qa` (QA / Test Engineer)

**Owns:** Tests, e2e, perf, visual regression.

**Tasks:** P0.E1.T7–T8, P0.E2 review, P1.E1.T8–T10, P1.E2.T11, P1.E3.T17–T18, P1.E4.T9, P1.E5.T8, P2.E1.T11, P2.E2.T8, P2.E3.T13, P2.E4.T13, P2.E5.T7, P2.E6.T11, P3.E1.T11, P3.E2.T11, P3.E3.T6, P3.E4.T11, P3.E5.T8, P3.E6.T4, T6, P3.E7.T5, P3.E8.T7, P4.E1.T12, P4.E2.T13, P4.E3.T4, P4.E4.T8, P4.E5.T4, P4.E6.T9, P4.E9.T6.

**Day-1 claim:** P0.E1.T7.

### 12.12 `release` (Release / DevOps)

**Owns:** CI, store, build, marketing assets.

**Tasks:** P0.E2, P0.E3.T5, P0.E4 all, P3.E9, P4.E6.T7, T9, P4.E7.T7, P4.E8, P4.E9, P4.E10.T2.

**Day-1 claim:** P0.E2.T1.

### 12.13 `lead` (Project Lead, human)

**Owns:** Decisions, conflict resolution, demo meetings, hiring.

**Tasks:** P2.E7, P3.E6.T1, P3.E9.T3–T6, P4.E5.T3, P4.E7.T3–T5, T8, P4.E8.T2–T3, T5, P4.E9.T7–T9, P4.E10.T1, T4.

**Day-1 claim:** none — lead runs meetings and reviews PRs.

---

## 13. Daily standup template

Each agent pastes this into the project Slack at the start of their day:

```
[agent_type] [date]
✅ Done yesterday: <task IDs completed>
🔄 In progress today: <task IDs working on>
🚧 Blocked: <task IDs blocked, with reason>
❓ Questions: <anything the lead should decide>
```

Lead rolls this up into a status board in the project wiki.

---

## 14. PR template

```markdown
## What
<one sentence describing the change>

## Task
Closes: <TASK_ID from this file>

## Spec refs
- <spec file> §<section>

## How to verify
- [ ] Step 1
- [ ] Step 2

## Checklist
- [ ] `yarn lint` passes
- [ ] `yarn typecheck` passes
- [ ] `yarn test` passes (new tests added for new code)
- [ ] `yarn prebuild` runs without errors
- [ ] No new TODOs without a linked task
- [ ] No new dependencies added (or ADR updated)
```

---

## 15. Task status board (live)

Maintained at the top of this file by convention. Agents update the
status of their claims. (In a real project, this would be a database
or GitHub Projects board. For this spec kit, the file is the source.)

| Phase | Total tasks | Done | In progress | Pending | Blocked |
|---|---|---|---|---|---|
| P0 | 24 | 24 | 0 | 0 | 0 |
| P1 | 47 | 0 | 0 | 47 | 0 |
| P2 | 60 | 0 | 0 | 60 | 0 |
| P3 | 64 | 0 | 0 | 64 | 0 |
| P4 | 65 | 0 | 0 | 65 | 0 |
| **Total** | **260** | **24** | **0** | **236** | **0** |

Updated daily by the `release` agent as part of the standup.

---

## 16. Definitions of done (per phase)

### 16.1 Phase 0 done when

- [x] All 24 P0 tasks done
- [x] `npm run ci` (lint + typecheck + test + prebuild) green
- [x] Both native shells configured and ready
- [x] CI workflows configured and tested

### 16.2 Phase 1 done when

- [ ] All 47 P1 tasks done
- [ ] Navigate from BootGate to Title to Settings, change language,
      see RTL flip, hear SFX
- [ ] DB opens, migrations apply, seed data loads
- [ ] All 6 stores skeleton in place

### 16.3 Phase 2 done when

- [ ] All 60 P2 tasks done
- [ ] Play Act 1 (8 levels + Nemean Lion boss) end-to-end
- [ ] Demo video recorded
- [ ] Stakeholder demo approved

### 16.4 Phase 3 done when

- [ ] All 64 P3 tasks done
- [ ] Play Acts 1–6 (50 levels, 6 bosses) end-to-end
- [ ] Internal TestFlight + Play internal builds distributed
- [ ] 10+ internal testers played for 1+ hour
- [ ] Bug triage done; P3 backlog finalized

### 16.5 Phase 4 done when

- [ ] All 65 P4 tasks done
- [ ] Play Acts 1–12 (100 levels, 12 bosses) end-to-end
- [ ] Closed beta with 30+ testers
- [ ] D1 retention ≥ 40% (from internal playtest data)
- [ ] App on App Store + Google Play
- [ ] D7 retention ≥ 18% (measured post-launch)

---

## 17. Change log

| Date | Change | By |
|---|---|---|
| 2026-09-10 | Initial creation (v0.1.0) | Mavis |

---

## 18. How an agent claims work (5-step flow)

```bash
# 1. Find an open task
grep "P2.E3.T" tasks.md
# Look for status: pending, all depends_on done, your agent type

# 2. Update tasks.md: change pending → in_progress, add claimed_by
# (Edit this file)

# 3. Read the spec
cat docs/spec-kit/08-puzzle-system.md
# Focus on §3 (Reflex), the mechanic you'll implement

# 4. Implement, test, commit
git checkout -b feat/p2-e3-t3-reflex-mechanic
# ... code ...
yarn lint && yarn typecheck && yarn test
git commit -m "P2.E3.T3: Implement ReflexPuzzle class"
git push -u origin feat/p2-e3-t3-reflex-mechanic

# 5. Open PR
gh pr create --title "P2.E3.T3: Implement ReflexPuzzle class" \
             --body "Closes P2.E3.T3. Spec: 08 §3"
# Wait for review, address feedback, merge
# Update task status to done
```

That's the loop. Run it 260 times and the game ships.

---

**Go build. The spec is the spec. The tasks are the tasks. Ship it.**
