# Project Olympian — Spec Kit

> **Mobile-first Greek-mythology RPG + puzzle game.**
> React Native · Local-only data · 100 levels · EN/AR (RTL) → ES/DE later.

---

## What this is

A build-ready specification kit for a 2D pixel-art RPG/puzzle hybrid set in
Greek mythology. Every file in this directory is a **complete, self-contained
contract** that an LLM build agent (or human engineer) can pick up and execute
without reading any other file in the kit — but cross-references are provided
where a concept spans multiple files.

**Audience:** Build agents (Claude Opus / GPT-class / human engineers) executing
the project. Each agent should be able to claim one or more files, follow the
spec to the letter, and produce a working module that integrates with the rest.

**No judgment calls remain.** Every value is pinned: every table column typed,
every component contract specified, every sprite size set, every shared-palette
color hex-coded, every API signature defined.

---

## Project codename

**Olympian** (working title; final name TBD by marketing post-playtest).
File-system, module, and DB names all use `olympian`.

---

## Stack (pinned)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React Native 0.76+ (Bare workflow, NOT Expo)** | Native control of Skia surface, MMKV, op-sqlite, IAP. Bare workflow is required. |
| Language | **TypeScript 5.5+ strict** | Strict mode enabled. No `any` in app code. |
| 2D Rendering | **`@shopify/react-native-skia`** | 60fps 2D canvas, sprite batching, tile maps, custom shaders. |
| Game loop / ECS | **`react-native-game-engine`** + **`expo-ecs`** pattern (manually replicated) | Entities + systems, fixed-timestep loop. |
| UI animations | **`react-native-reanimated 3`** | Native-thread animations, 60fps UI. |
| State (app) | **`zustand`** + **`immer`** | Lightweight, performant, no boilerplate. |
| Persistence (KV) | **`react-native-mmkv`** | Synchronous, fast, used for flags & settings. |
| Persistence (DB) | **`@op-engineering/op-sqlite`** | Fastest SQLite for RN, JSI-based. |
| Navigation | **`@react-navigation/native` v7** + native-stack | Standard, well-supported. |
| IAP | **`react-native-iap`** | iOS App Store + Google Play Billing v6. |
| i18n | **`i18next`** + **`react-i18next`** + **`react-native-localize`** | Mature, RTL-friendly. |
| Audio | **`react-native-sound`** (SFX) + **`react-native-track-player`** (music) | Simple API, gapless music. |
| Image cache | **`@d11/react-native-fast-image`** | Sprite sheet caching. |
| Testing | **`jest`** + **`@testing-library/react-native`** + **`detox`** (e2e) | Standard. |
| Lint/format | **`eslint`** + **`prettier`** + **`typescript-eslint`** | Standard. |

**Rejected alternatives** (and why):
- **Expo** — Bare workflow chosen. We need direct native module access for Skia
  surface, op-sqlite, MMKV, and IAP without EAS overhead.
- **Unity / Godot** — Overkill for 2D pixel art. Heavier APK, longer build times.
- **Flutter / Flame** — User requested React Native.
- **Redux Toolkit** — Heavier than Zustand, slower for game-loop state.

---

## Repo layout (one-liner)

```
olympian/
├── android/                  # Native Android shell
├── ios/                      # Native iOS shell
├── src/                      # All TypeScript app code
├── assets/                   # Sprite sheets, audio, fonts
├── data/                     # Seed JSON, palettes, level definitions
├── docs/spec-kit/            # ← You are here
├── scripts/                  # Build, asset-bake, schema-gen
├── __tests__/                # Test suites
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── README.md
```

Full layout in [`14-build-test-and-milestones.md`](./14-build-test-and-milestones.md#repo-layout).

---

## Doc index

| # | File | Purpose | Owner-role |
|---|---|---|---|
| 00 | **README** (this file) | Project overview, stack, index | — |
| 01 | [Game Design Document](./01-game-design-document.md) | Story, mechanics, 12 labors, 100 levels, content rules | Game Designer |
| 02 | [Technical Architecture](./02-technical-architecture.md) | Module layering, build pipeline, runtime model | Tech Lead |
| 03 | [Data Model & Database](./03-data-model-and-database.md) | SQLite schema, migrations, seed data, queries | DB Engineer |
| 04 | [State Management](./04-state-management.md) | Zustand stores, event log, persistence | App Engineer |
| 05 | [UI Component Library](./05-ui-component-library.md) | Components, design tokens, theming, RTL-aware | UI Engineer |
| 06 | [Screen Flows & Navigation](./06-screen-flows-and-navigation.md) | All screens, transitions, deep links | Navigation Engineer |
| 07 | [Game Engine & Rendering](./07-game-engine-and-rendering.md) | Skia setup, tile maps, sprite system, animation | Graphics Engineer |
| 08 | [Puzzle System](./08-puzzle-system.md) | 6 puzzle mechanics, contracts, level templates | Puzzle Designer |
| 09 | [RPG System](./09-rpg-system.md) | Combat, stats, party, leveling, items | Game Designer |
| 10 | [i18n & RTL](./10-i18n-and-rtl.md) | String tables, locale mgmt, RTL strategy | i18n Engineer |
| 11 | [Audio System](./11-audio-system.md) | Music, SFX, mixing, ducking | Audio Engineer |
| 12 | [Asset Pipeline](./12-asset-pipeline.md) | Piskel → sprite sheet, palette, build-time bake | Pipeline Engineer |
| 13 | [Paywall & IAP](./13-paywall-and-iap.md) | react-native-iap, deferred monetization hook | IAP Engineer |
| 14 | [Build, Test & Milestones](./14-build-test-and-milestones.md) | RN build, test strategy, 4-month sprint, repo layout | Release Engineer |

---

## MVP scope (pinned)

| Dimension | MVP (ship at month 3) | v1.0 (ship at month 4) |
|---|---|---|
| Levels | **50** (Labors 1–6 fully populated) | **100** (Labors 1–12 fully populated) |
| Labors | 6 | 12 |
| Sub-areas per labor | 8 (~6.25 levels/area) | 8 (~8.3 levels/area) |
| Companions | 2 joinable (Athena + 1 mortal) | 4 joinable |
| Enemy types | 6 | 14 |
| Puzzle mechanics | All 6 represented (≥1 level each) | All 6, 8+ levels each |
| Languages | EN, AR (RTL) | + ES, DE |
| IAP | Paywall screen, products stubbed | TBD post-playtest |
| Cloud save | None (local-only) | None (deferred) |
| Accounts | None | None (deferred) |

---

## The 12 Labors (themed zones)

Each labor = 1 Act with 8 sub-areas. v1.0 ships all 12. MVP ships Acts 1–6.

| Act | Labor | Biome | Signature puzzle |
|---|---|---|---|
| 1 | Nemean Lion | Arid hills, lion dens | Reflex (trap-dodge) |
| 2 | Lernaean Hydra | Swamp, regenerating nodes | Sequence (pattern memory) |
| 3 | Ceryneian Hind | Forest, golden trails | Path (Sokoban) |
| 4 | Erymanthian Boar | Snowy mountain, slopes | Timing (rhythm-match) |
| 5 | Augean Stables | Tile-clean grid | Logic (constraint-satisfaction) |
| 6 | Stymphalian Birds | Reed marsh, aerial swarms | Refraction (laser-mirror) |
| 7 | Cretan Bull | Labyrinth complex | Maze (recursive) |
| 8 | Mares of Diomedes | Stables, man-eating herd | Logic (constraint) |
| 9 | Girdle of Hippolyta | Amazon territory | Refraction + Reflex |
| 10 | Cattle of Geryon | Multi-island ferry | Path + Sequence |
| 11 | Apples of the Hesperides | Garden of twilight | Maze + Logic |
| 12 | Cerberus | Underworld finale | All 6 mechanics combined |

---

## Build order (for the build agents)

A suggested parallelization:

**Sprint 1 (parallel — independent tracks)**
- Agent A → `02-technical-architecture.md` + scaffold repo
- Agent B → `12-asset-pipeline.md` + Piskel template + palette
- Agent C → `10-i18n-and-rtl.md` + string table schema

**Sprint 2 (after A & C done)**
- Agent A → `03-data-model-and-database.md` (depends on arch)
- Agent D → `05-ui-component-library.md` (depends on tokens)
- Agent E → `11-audio-system.md`

**Sprint 3**
- Agent A → `04-state-management.md`
- Agent D → `06-screen-flows-and-navigation.md`
- Agent F → `07-game-engine-and-rendering.md` (depends on arch + assets)

**Sprint 4**
- Agent F → `08-puzzle-system.md` + `09-rpg-system.md` (depends on engine)
- Agent G → `13-paywall-and-iap.md`
- Agent H → `14-build-test-and-milestones.md`

**Sprint 5+** = content authoring (levels, sprites, audio) using the locked specs.

---

## How to use this kit

1. **Read 00 → 02 first.** Stack and architecture set every downstream constraint.
2. **Each build agent reads exactly one spec file** and the index. Cross-refs
   resolve to other files if needed.
3. **Do not change stack choices** without a written ADR (architecture decision
   record) in `02-technical-architecture.md#adrs`. Stack is pinned to keep
   15 agents from forking 15 ways.
4. **All file paths in this kit are relative to `docs/spec-kit/`.** Repo
   paths are relative to repo root and prefixed with `src/`, `assets/`, etc.

---

## Versioning

| Field | Value |
|---|---|
| Spec kit version | **0.1.0** |
| Status | Draft, ready for build |
| Last updated | 2026-09-09 |
| Owner | Project Mavis |

Bump minor version on additive changes (new puzzle mechanic, new screen).
Bump major on breaking changes (stack swap, schema rewrite).

---

## Open questions (deferred to playtest)

These are explicitly **out of scope** for the build phase. Resolve after the
MVP ships and real players have run it for 2+ weeks.

1. **Pricing** — paywall exists, products are stubbed. Set after playtest.
2. **Ads** — no ad SDK integrated. Add if retention justifies it.
3. **Cloud save / accounts** — local-only for now. Add if players ask.
4. **Spanish + German** — schema supports it, only EN + AR shipped at MVP.
5. **Daily quests / events** — out of scope until retention data exists.
6. **Console / Steam port** — not in roadmap, but RN-to-Switch is feasible.
