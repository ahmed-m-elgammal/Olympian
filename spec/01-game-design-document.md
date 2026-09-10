# 01 — Game Design Document

> **Working title:** Olympian
> **Genre:** 2D pixel-art RPG + puzzle hybrid
> **Platform:** Mobile (iOS + Android)
> **Player mode:** Single-player, offline, no accounts

---

## 1. High concept

You are a **nameless hero** summoned by the gods to undertake the Twelve Labors
of Olympus. Each labor is a self-contained act of 8 sub-areas; each sub-area
holds 1–2 puzzle-rooms gated by a boss fight. The world is rendered in crisp
pixel art, viewed top-down for overworld and side-view for combat, with marble
statues, olive groves, and burning Mediterranean light as the visual anchor.

The core loop: **enter a labor → explore the overworld → encounter a puzzle
room → solve the puzzle (gated by a learned mechanic) → face the boss → earn a
relic, a companion, or a stat boost → unlock the next labor.**

Pacing rule: every 5–8 minutes of play must hit at least one of: a new puzzle
mechanic, a boss, a stat-up moment, or a story beat. No filler walking.

---

## 2. Story spine (12 acts, 100 levels)

The player is a mortal conscripted by **Athena** to restore the **Pillar of
Olympus** — a cosmic column that has cracked, weakening the gods and
unleashing the Twelve Monsters back into the mortal world. Each labor repairs
one of the twelve facets of the Pillar.

### 2.1 The Twelve Labors (Acts)

| Act | Title | Setting | Boss | Reward |
|---|---|---|---|---|
| 1 | **The Nemean Lion** | Arid Peloponnese hills, golden grass | Nemean Lion | Pelt of Nemea (defense +5) |
| 2 | **The Lernaean Hydra** | Poisoned swamp, nine-headed | Lernaean Hydra | Hydra Bile (poison weapon) |
| 3 | **The Ceryneian Hind** | Mountain forest, golden antlers | Ceryneian Hind (companion) | Speed Boots |
| 4 | **The Erymanthian Boar** | Snowy Mount Erymanthos | Erymanthian Boar | Charge Horn (cleave attack) |
| 5 | **The Augean Stables** | Decaying palace stables | Augeas (king) | Divine Broom (cleans rooms) |
| 6 | **The Stymphalian Birds** | Reed marsh, bronze beaks | Stymphalian Birds (swarm) | Winged Sandals |
| 7 | **The Cretan Bull** | Labyrinth of Knossos | Minotaur | Thread of Ariadne (no-fail maze) |
| 8 | **The Mares of Diomedes** | Thracian stables, fire-breathing horses | Diomedes' Mares | Bridle of Taming (mount) |
| 9 | **The Girdle of Hippolyta** | Amazon borderland | Hippolyta (companion) | Girdle of War (party-wide +ATK) |
| 10 | **The Cattle of Geryon** | Three-island ferry | Geryon (three-bodied) | Ferry Token (fast travel) |
| 11 | **The Apples of the Hesperides** | Twilight garden, singing nymphs | Ladon (dragon) | Apple of Eternal Health (respec) |
| 12 | **Cerberus** | Underworld, river Styx | Hades | Pillar of Olympus (complete) |

### 2.2 Companion roster (joinable, max 3 in active party)

| Companion | Joined at | Role | Signature ability |
|---|---|---|---|
| **Athena** (goddess) | Prologue, forced | Mage / Healer | "Wisdom" — reveals one puzzle hint, 1×/level |
| **Ceryneian Hind** | Act 3 boss | Scout | "Fleet" — auto-dodges first trap per room |
| **Hippolyta** | Act 9 boss | Warrior | "War-Cry" — all enemies -ATK for 1 turn |
| **Orpheus** (hidden) | Act 11 secret | Bard | "Song" — repels undead, charm passive |

Players may switch the active companion in towns/hubs. The protagonist is
always present.

---

## 3. Core loop (the gameplay heartbeat)

```
┌──────────────────────────────────────────────────────────────┐
│  HUB TOWN (Act hub: temple, shops, save point, party mgmt)  │
│  ↓ tap "depart"                                              │
│  OVERWORLD (top-down tile map of current Act)                 │
│  ↓ walk into marker                                           │
│  PUZZLE ROOM (focused single screen, mechanic-specific)        │
│  ↓ solve → loot chest → exit                                   │
│  (optional) BOSS GATE (must defeat mini-boss to open)          │
│  ↓                                                             │
│  BOSS ROOM (combat + puzzle fusion)                            │
│  ↓ win                                                         │
│  REWARD SCREEN → return to HUB                                 │
│  ↓                                                             │
│  NEXT ACT (gated by relic collected)                           │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Hub → Overworld → Puzzle → Boss

- **Hub**: Persistent. Save, swap party, check relic wall, view map.
- **Overworld**: 1 screen per Act (256×192 tiles, scrolls). Contains N
  puzzle markers and 1 boss marker.
- **Puzzle Room**: 1-screen focused, mechanic-pure (no combat).
- **Boss Room**: 1-screen, combat-puzzle fusion (boss has a puzzle-weakness
  phase).

### 3.2 Pacing targets (per Act)

| Metric | Target |
|---|---|
| Levels in Act | 8 sub-areas × 1–2 rooms ≈ 8–16 puzzle rooms + 1 boss |
| Time per Act (first-time) | 35–50 min |
| Time per Act (replay) | 18–25 min (puzzles still require execution) |
| Deaths per Act (avg player) | 3–6 |
| Puzzles per Act | 12–18 |
| Boss attempts (avg) | 1.8 |

---

## 4. Puzzle mechanics (the 6 pillars)

Every Act has a **signature mechanic** that appears in 60% of its puzzles.
The other 40% mix in 1–2 secondary mechanics to keep variety.

| # | Mechanic | Description | Sample input | Sample failure |
|---|---|---|---|---|
| 1 | **Reflex** | Dodge traps on a time-budgeted grid. Tap-to-move a 1-tile avatar across a hazardous field. | Tap direction | Touch a trap |
| 2 | **Sequence** | Watch a pattern, repeat it. Like Simon-says. | Tap tiles in order | Wrong tile, restart |
| 3 | **Path** | Sokoban-style: push crates onto goal tiles, 1-square at a time. | Swipe direction | Push into corner / wall |
| 4 | **Timing** | Rhythm-tap. A bar scrolls; tap at the green zone. | Tap | Off-tempo |
| 5 | **Logic** | Constraint-satisfaction. Fill a grid (e.g. laser → mirror → target). | Drag & drop | Beam misses target |
| 6 | **Maze** | Recursive labyrinth with dead ends. | Joystick drag | Hit dead end, lose 1 heart |

Full spec in [`08-puzzle-system.md`](./08-puzzle-system.md).

### 4.1 Puzzle gating

Puzzles have **3 difficulty tiers** within an Act:
- **Tier 1** (rooms 1–3): tutorial, 1 mechanic, ≤6 steps
- **Tier 2** (rooms 4–6): 1 mechanic + 1 twist, ≤10 steps
- **Tier 3** (rooms 7–8 + boss): 2 mechanics fused, ≤14 steps

**Player can request 1 hint per puzzle** (Athena's "Wisdom" or paid). After
2 failed attempts, a "Skip for 1 gem" option appears. Gems are earned in-game,
not purchased.

### 4.2 Boss-puzzle fusion

Each Act's boss has **2 phases**:
1. **Combat phase** — turn-based combat (see [`09-rpg-system.md`](./09-rpg-system.md))
2. **Puzzle phase** — boss is invulnerable; player must solve a mini-puzzle
   matching the Act's signature mechanic. On solve, boss takes 1 finishing
   hit → dead.

This guarantees the signature mechanic appears ≥1 time in every Act.

---

## 5. RPG systems (summary)

Full spec in [`09-rpg-system.md`](./09-rpg-system.md). Summary:

| System | Rule |
|---|---|
| Combat | Turn-based, 3v3 party vs 3v3 enemies |
| Stat budget | HP, ATK, DEF, SPD, INT, LCK — all integers, no float |
| Level cap | 50 (player), 30 (companions) |
| XP curve | Quadratic: `xp_to_next = 50 * level^1.6` |
| Equipment | 6 slots: weapon, helm, body, trinket, ring, relic |
| Inventory | 32-slot grid, common/rare/epic/legendary |
| Death | 1 HP recovered, lose 25% gold, respawn at hub |
| Save | Auto-save on every puzzle solve, on every boss, on app background |

---

## 6. Content structure (the 100 levels)

### 6.1 Act → Sub-area → Room hierarchy

```
Act (12 total)
└── Sub-area (8 per Act = 96 total)
    └── Room (1–2 per sub-area, 100–192 total)
        └── Encounter (1 puzzle OR 1 boss OR 1 treasure OR 1 story beat)
```

### 6.2 MVP vs v1.0 content split

| Act | Sub-areas at MVP | Sub-areas at v1.0 | Rooms at MVP | Rooms at v1.0 |
|---|---|---|---|---|
| 1 | 8 | 8 | 12 | 14 |
| 2 | 8 | 8 | 12 | 14 |
| 3 | 8 | 8 | 12 | 14 |
| 4 | 8 | 8 | 12 | 14 |
| 5 | 8 | 8 | 12 | 14 |
| 6 | 8 | 8 | 12 | 14 |
| 7 | — | 8 | — | 16 |
| 8 | — | 8 | — | 14 |
| 9 | — | 8 | — | 14 |
| 10 | — | 8 | — | 14 |
| 11 | — | 8 | — | 14 |
| 12 | — | 8 | — | 18 (finale is longer) |
| **Total** | **48 sub-areas** | **96 sub-areas** | **~72 rooms** | **~172 rooms** |

**MVP target: 50+ completable levels.** v1.0 target: 100+ levels. The schema
supports up to 200 levels without code changes.

### 6.3 Level definition file format

Each level is a JSON file in `data/levels/act{N}/area{M}/room_{R}.json`:

```json
{
  "id": "act1_area3_room2",
  "version": 1,
  "act": 1,
  "area": 3,
  "room": 2,
  "biome": "arid_hills",
  "type": "puzzle",            // puzzle | boss | treasure | story
  "mechanics": ["reflex"],
  "difficulty_tier": 2,
  "tilemap": "act1_area3_room2.tmx",
  "sprite_atlas": "atlas_creatures_01.png",
  "music_track": "act1_explore.ogg",
  "ambience": "wind_dry_loop.ogg",
  "spawn_point": { "x": 4, "y": 8 },
  "exit_point": { "x": 28, "y": 8 },
  "puzzle": {
    "mechanic": "reflex",
    "config": { /* mechanic-specific */ }
  },
  "loot": [
    { "item": "gold", "qty": 50 },
    { "item": "potion_minor", "qty": 1, "drop_rate": 0.4 }
  ],
  "first_clear_rewards": {
    "xp": 120,
    "gold": 200,
    "items": ["boots_of_speed"]
  }
}
```

**Locked values** (do not change):
- `id` schema: `act{N}_area{M}_room{R}` where N, M, R are 1-indexed integers
- Coordinates are in **tile units** (1 tile = 16px)
- `mechanics` array: 1–2 entries, must reference a mechanic in [`08-puzzle-system.md`](./08-puzzle-system.md)
- `difficulty_tier`: 1, 2, or 3
- `puzzle.config` shape is **mechanic-specific**; see [`08-puzzle-system.md`](./08-puzzle-system.md#per-mechanic-config-schemas)

---

## 7. Visual & art direction

### 7.1 Style

- **Resolution:** 320×180 logical units, scaled to device ×  integer.
- **Tile size:** 16×16 px (overworld) and 16×16 px (interior).
- **Sprite size:** characters 16×24 px (tall sprites), enemies 16×16 or 24×24.
- **Palette:** 32 colors total, shared across all assets. Defined in
  [`12-asset-pipeline.md`](./12-asset-pipeline.md#shared-palette).
- **Style reference:** Greek vase painting (figure-ground, profile poses,
  terracotta + black + ivory accents), translated to a modern pixel grid.
  NOT copying any specific game IP.
- **Animation:** all character sprites have idle (4-frame) and walk (6-frame)
  cycles. Combat has attack (3-frame) and hit (2-frame) cycles.

### 7.2 What to draw (sprite inventory)

- **Hero:** 1 protagonist, 4 frames × 4 directions = 16 sprites for idle,
  + 24 for walk = **40 hero sprites** total
- **4 companions:** 30 sprites each = **120 companion sprites**
- **14 enemy types:** 12 sprites each = **168 enemy sprites**
- **Tile sets:** 12 biomes × ~80 tiles each = **~960 tile sprites**
- **UI icons:** 64×64, 80 icons (items + UI) = **80 UI icons**
- **Total sprite count:** ~1,400 sprites, fitting in **~6 sprite sheets**
  of 1024×1024 each

All authored in **Piskel**, exported as PNG, baked into sprite sheets by
the asset pipeline (see [`12-asset-pipeline.md`](./12-asset-pipeline.md)).

---

## 8. Audio direction

- **Music:** Chiptune / 8-bit style. One looping track per Act (12 tracks),
  plus 4 hub themes, plus 1 boss theme, plus 1 victory fanfare.
- **SFX:** 50–70 short effects (≤1s): hit, dodge, puzzle-solve, level-up,
  chest, footstep, menu-tick, etc.
- **Ambience:** Loopable ambient beds per biome (wind, swamp, fire, etc.).
- **Mixing:** Music ducks to 30% during dialogue and puzzle-fail stingers.

Full spec in [`11-audio-system.md`](./11-audio-system.md).

---

## 9. Player onboarding (first 5 minutes)

| Time | Event |
|---|---|
| 0:00 | Title screen → tap → language picker (EN/AR) |
| 0:15 | Story intro: pillar cracking, Athena speaks, hero summoned |
| 0:45 | Hero name entry (default "Alexios", 8-char max) |
| 1:15 | First overworld: small Nemean glade, walkable, one puzzle visible |
| 1:30 | First puzzle (Reflex tutorial, 4 tiles, 3 traps) — Athena narrates |
| 2:30 | First loot: gold + minor potion |
| 3:00 | First enemy encounter — combat tutorial, 1v1 |
| 4:30 | First boss (mini-boss: a stray jackal) |
| 5:00 | Relic: Pelt of Nemea, stat-up cutscene, return to Act 1 hub |
| 5:00+ | Player is now in the main loop |

**Target 5-min retention: 75%+.**

---

## 10. Monetization (deferred — placeholder only)

Per project rules, **no monetization UI ships at MVP**. The paywall screen
exists in the architecture with stub products so the integration is verified
but not advertised. See [`13-paywall-and-iap.md`](./13-paywall-and-iap.md).

After playtest, decisions to make:
- Single IAP $4.99 (premium unlock) vs free with rewarded ads vs hybrid
- Cosmetics pack pricing
- Battle-pass feasibility

**Out of MVP scope:** ads SDK, push notifications, social share, leaderboards.

---

## 11. Accessibility

- **Text size:** 100% / 125% / 150% / 200% (system-level, applied via
  Reanimated)
- **Color-blind mode:** 4 palettes (default, protan, deutan, tritan) —
  see [`12-asset-pipeline.md`](./12-asset-pipeline.md#color-blind-palettes)
- **Reduce motion:** disables Reanimated parallax, particles, screen shake
- **One-handed mode:** UI resizes to bottom half of screen (toggle in settings)
- **Left-handed mode:** joystick + buttons mirror (toggle in settings)
- **Audio cues for puzzles:** optional SFX replacement for visual-only cues
- **Save-anywhere:** manual save button always available (separate from
  auto-save)

---

## 12. Content authoring rules (for the build agents generating levels)

When a build agent (or human) authors a new level JSON, the following rules
**must** hold:

1. **No 2 levels share the same tilemap+mechanic+difficulty combo.**
2. **Every Act has at least 1 level of each tier 1/2/3.**
3. **Every Act's boss is solvable in ≤8 attempts by a player at the
   recommended level (mean party level for the Act).**
4. **No level awards more than 1 legendary item** (balance constraint).
5. **All level JSONs validate against `data/schemas/level.schema.json`** —
   see [`03-data-model-and-database.md`](./03-data-model-and-database.md#level-schema).
6. **Music track reference must exist** in `assets/audio/music/`.
7. **All sprite atlas references must exist** in `assets/sprites/`.

Validation is enforced by the build script `scripts/validate-content.ts`.

---

## 13. Success metrics (post-launch)

| Metric | Target |
|---|---|
| D1 retention | 40%+ |
| D7 retention | 18%+ |
| D30 retention | 8%+ |
| Avg session length | 18 min |
| Levels/day per active user | 4–6 |
| Crash rate | <0.1% |
| Avg app size | <80 MB |
| Cold start | <2.5s on mid-tier device |

These inform future content and balance decisions but **do not gate the MVP
ship**. MVP ships when the 50 levels play cleanly end-to-end.
