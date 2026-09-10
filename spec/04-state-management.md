# 04 — State Management

> **State library:** Zustand 5 + Immer 10
> **Persistence:** op-sqlite (game data) + MMKV (flags, ephemeral)
> **Pattern:** Sliced stores + selectors + middleware

---

## 1. State architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  UI Components (Layer 6)                                    │
│      │  select(state)  ← derived data                       │
│      │  store.action()  ← mutations                         │
│      ▼                                                       │
│  Zustand stores (Layer 5 boundary)                          │
│      │  subscribe, getState                                  │
│      │                                                       │
│  ┌───┴────────────────────────────────────────┐             │
│  │  Persistence layer                          │             │
│  │  - saveManager: snapshot ↔ DB              │             │
│  │  - settingsStore ↔ MMKV                    │             │
│  │  - eventLog: append-only                   │             │
│  └────────────────────────────────────────────┘             │
│      │                                                       │
│  op-sqlite / MMKV                                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 The 6 stores

| Store | Owns | Persisted to |
|---|---|---|
| `playerStore` | Hero stats, gold, level, XP, current location | SQLite (`saves` + `hero_stats`) |
| `partyStore` | Active party (hero + ≤2 companions), companion stats | SQLite (`companions` + `equipment`) |
| `inventoryStore` | Inventory items, equipment loadout | SQLite (`inventory` + `equipment`) |
| `progressStore` | Level clear state, stars, attempts, deaths | SQLite (`progress` + `bosses` + `relics`) |
| `settingsStore` | Locale, audio volumes, accessibility flags | SQLite (`settings`) + MMKV cache |
| `sessionStore` | Active play session, ephemeral UI state, in-progress puzzle | **Not persisted** (RAM only) |

The first 4 are **persistent game state**. `settingsStore` is persistent
but per-save. `sessionStore` is ephemeral.

---

## 2. Save snapshot (the canonical game state)

```typescript
// src/data/stores/types.ts
export interface SaveSnapshot {
  save: Save;                    // from `saves` table
  hero: HeroStats;               // from `hero_stats`
  companions: Companion[];       // from `companions` where is_joined = 1
  inventory: InventoryEntry[];   // from `inventory`
  equipment: EquipmentEntry[];   // from `equipment`
  progress: ProgressEntry[];     // from `progress`
  bosses: BossState[];           // from `bosses`
  relics: Relic[];               // from `relics`
  settings: Settings;            // from `settings`
  checksum: string;              // SHA-256 of serialized (without checksum)
}
```

This is the **single source of truth** for game state. On hydrate, the
full snapshot is loaded from SQLite. On every mutation, the relevant
slice is updated AND the corresponding SQLite row(s) is written.

---

## 3. Store definitions

### 3.1 `playerStore`

```typescript
// src/data/stores/playerStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persistToSqlite, hydrateFromSqlite } from '../persistence/saveManager';

interface PlayerState {
  save: Save | null;
  hero: HeroStats | null;
  isLoaded: boolean;

  // Actions
  hydrate: (saveId: string) => Promise<void>;
  updateHero: (patch: Partial<HeroStats>) => void;
  addXp: (xp: number) => void;
  addGold: (delta: number) => void;
  healToFull: () => void;
  setCurrentLocation: (act: number, area: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
  immer((set, get) => ({
    save: null,
    hero: null,
    isLoaded: false,

    hydrate: async (saveId) => {
      const snap = await hydrateFromSqlite(saveId);
      set((s) => {
        s.save = snap.save;
        s.hero = snap.hero;
        s.isLoaded = true;
      });
    },

    updateHero: (patch) => {
      set((s) => {
        if (!s.hero) return;
        Object.assign(s.hero, patch);
      });
      persistToSqlite.throttle(get().save!.id, 'hero_stats');
    },

    addXp: (xp) => {
      set((s) => {
        if (!s.hero) return;
        s.hero.xp += xp;
        // leveling handled by domain/leveling.ts
        const { leveledUp, newLevel } = applyLevelCurve(s.hero);
        if (leveledUp) s.hero.level = newLevel;
      });
      persistToSqlite.throttle(get().save!.id, 'hero_stats');
    },

    // ... other actions
  }))
);
```

### 3.2 `partyStore`

Manages the active 3-slot party (hero + 2 companions). Party composition
changes only in hubs.

```typescript
interface PartyState {
  active: PartySlot[];            // length ≤ 3, [0] is always hero
  bench: string[];                // joined companion ids not in active

  setActive: (companionId: string, slotIndex: 1 | 2) => void;
  swapWithBench: (slotIndex: 1 | 2) => void;
  levelUpCompanion: (id: string) => void;
}
```

### 3.3 `inventoryStore`

```typescript
interface InventoryState {
  items: InventoryEntry[];        // full inventory
  equipment: EquipmentEntry[];    // current equipment
  capacity: number;               // default 200

  addItem: (itemId: string, qty: number, source: string) => void;
  removeItem: (itemId: string, qty: number) => void;
  equip: (itemId: string, slot: EquipSlot, target: EquipTarget) => void;
  unequip: (slot: EquipSlot, target: EquipTarget) => void;
  useConsumable: (itemId: string) => void;
}
```

### 3.4 `progressStore`

```typescript
interface ProgressState {
  levels: Map<string, ProgressEntry>;   // keyed by level_id
  bosses: Map<string, BossState>;       // keyed by boss_id
  relics: Relic[];
  totalStars: number;

  markLevelStarted: (levelId: string) => void;
  markLevelCleared: (levelId: string, stats: ClearStats) => void;
  markBossDefeated: (bossId: string) => void;
  grantRelic: (relicId: string, act: number) => void;
  recomputeUnlocks: () => void;          // determines which levels are accessible
}
```

`recomputeUnlocks()` runs after every progress change. It applies the
unlock graph defined in the level metadata.

### 3.5 `settingsStore`

```typescript
interface SettingsState {
  language: Locale;                  // 'en' | 'ar' | ...
  musicVolume: number;               // 0..1
  sfxVolume: number;                 // 0..1
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  colorBlindMode: 'none' | 'protan' | 'deutan' | 'tritan';
  oneHandedMode: boolean;
  leftHanded: boolean;
  textScale: 1.0 | 1.25 | 1.5 | 2.0;

  setLanguage: (lang: Locale) => void;     // also writes MMKV + i18n.changeLanguage
  setMusicVolume: (v: number) => void;    // also calls Audio.setMusicVolume
  // ...
}
```

`settingsStore` is the bridge between SQLite (canonical) and MMKV
(cached for fast cold-start).

### 3.6 `sessionStore` (ephemeral)

```typescript
interface SessionState {
  currentLevelId: string | null;
  currentAct: number;
  currentArea: number;
  puzzleState: PuzzleRuntimeState | null;
  combatState: CombatRuntimeState | null;
  dialogueLineIndex: number;
  isPaused: boolean;
  modalStack: ModalSpec[];

  enterLevel: (levelId: string) => void;
  exitLevel: () => void;
  pushModal: (m: ModalSpec) => void;
  popModal: () => void;
  pause: () => void;
  resume: () => void;
}
```

`sessionStore` is **never persisted**. On app background, the current
`puzzleState` and `combatState` are written to MMKV under
`session/in_progress` and restored on resume. If app is force-killed, the
in-progress state is lost — that's acceptable for MVP.

---

## 4. Persistence

### 4.1 `saveManager`

```typescript
// src/data/persistence/saveManager.ts
import { db } from '@/platform/storage/sqlite';
import type { SaveSnapshot } from '@/data/stores/types';

export async function hydrateFromSqlite(saveId: string): Promise<SaveSnapshot> {
  const save = await db.get('SELECT * FROM saves WHERE id = ?', [saveId]);
  const hero = await db.get('SELECT * FROM hero_stats WHERE save_id = ?', [saveId]);
  const companions = await db.all(
    'SELECT * FROM companions WHERE save_id = ? AND is_joined = 1', [saveId]
  );
  // ... rest of the hydration queries
  const checksum = sha256(JSON.stringify({ save, hero, companions, /* ... */ }));
  return { save, hero, companions, /* ... */ checksum };
}

export function persistToSqlite(saveId: string, slice: PersistSlice): void {
  // Debounced/throttled writer
  // Maps slice → SQL writes
}

export function flushAll(saveId: string): void {
  // Synchronous flush of all pending writes — called on app background
}
```

### 4.2 Throttling

UI must feel instant. SQL writes are batched with `throttle(50ms)`,
debounced for high-frequency events. Critical writes (boss defeated,
relic collected, level cleared) bypass the throttle.

```typescript
// Pseudocode
const writer = createWriter({
  throttleMs: 50,
  bypass: ['level_cleared', 'boss_defeated', 'relic_collected', 'iap_purchase'],
});
```

### 4.3 Checksum & corruption recovery

On every full save (manual + auto), compute `sha256(JSON.stringify(snapshot.withoutChecksum))`
and write to `saves.checksum`. On load, if mismatch → fall back to the
last auto-save (which keeps its own checksum). If both fail, show
"Save corrupted" dialog and offer to start a new game in the slot.

### 4.4 Save triggers

| Event | Save trigger | Mode |
|---|---|---|
| Level cleared | Auto-save | Bypass throttle |
| Boss defeated | Auto-save | Bypass throttle |
| Relic collected | Auto-save | Bypass throttle |
| IAP completed | Auto-save | Bypass throttle |
| Inventory changed | Debounced 500ms | Throttled |
| Hero stats changed | Throttled 50ms | Throttled |
| Settings changed | Throttled 50ms | Throttled |
| App backgrounded | Flush all | Synchronous |
| App killed (force) | None — last good auto-save | — |

### 4.5 Slot management

3 save slots. Each is an independent row in `saves`. UI lets the user
copy, delete, or rename slots (rename = just an `alias` we add to the
`saves` table at v2 — for MVP, `hero_name` is the display name).

---

## 5. Event log

The `event_log` table is an **append-only audit trail** of every
meaningful player action.

```typescript
// src/data/persistence/eventLog.ts
type EventType =
  | 'level_started'
  | 'level_cleared'
  | 'level_failed'
  | 'boss_defeated'
  | 'item_acquired'
  | 'item_used'
  | 'gold_changed'
  | 'xp_gained'
  | 'level_up'
  | 'relic_collected'
  | 'companion_joined'
  | 'dialogue_seen'
  | 'iap_purchase'
  | 'iap_restore'
  | 'settings_changed';

export function logEvent(
  saveId: string,
  type: EventType,
  payload: Record<string, unknown>
): void {
  const seq = getNextSequence(saveId);
  db.executeSync(
    'INSERT INTO event_log (save_id, sequence, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    [saveId, seq, type, JSON.stringify(payload), Date.now()]
  );
}
```

**Used for:**
1. "Recent activity" feed in the hub
2. Future cloud sync (deferred)
3. Playtesting analytics if/when added
4. Replay system (deferred)

**Rotation:** if `event_log` exceeds 10,000 rows for a save, archive
oldest 5,000 to a JSON file in app documents, reset sequence.

---

## 6. Selectors

Components consume state through **selectors**, never the whole store.

```typescript
// BAD
const hero = usePlayerStore((s) => s.hero);

// GOOD
const heroName = usePlayerStore((s) => s.hero?.name);
const heroHpPercent = usePlayerStore((s) =>
  s.hero ? s.hero.hp_current / s.hero.hp_max : 0
);
```

For derived data that combines multiple stores, use a custom hook in
`src/data/selectors/`:

```typescript
// src/data/selectors/partyDerived.ts
export function usePartyPowerLevel() {
  return usePlayerStore((s) => {
    const hero = s.hero;
    if (!hero) return 0;
    return hero.level * 10 + hero.atk + hero.def;
  });
}
```

### 6.1 Selector perf rule

A selector **must** return a referentially stable value when its inputs
are unchanged. For object/array returns, use `shallow` equality from
`zustand/shallow`:

```typescript
import { shallow } from 'zustand/shallow';

const { items, capacity } = useInventoryStore(
  (s) => ({ items: s.items, capacity: s.capacity }),
  shallow
);
```

---

## 7. Game loop integration

The game loop reads from and writes to `sessionStore` for ephemeral
state, and writes through to persistent stores on key events.

```typescript
// src/game/engine/loop/GameLoop.ts (pseudocode)
class GameLoop {
  step(dt: number) {
    const session = useSessionStore.getState();
    if (session.isPaused) return;

    this.world.step(dt);   // ECS systems run here, may write to stores
    this.world.render();

    // After step, sync critical state to persistence
    if (this.shouldSave()) {
      this.saveManager.flushSync();
    }
  }
}
```

Game systems **never call SQL directly**. They mutate the relevant
Zustand store, which triggers a debounced write.

---

## 8. DevTools

- **Zustand DevTools middleware** enabled in `__DEV__` only.
- **Redux DevTools** compatible (Zustand supports it via middleware).
- **MMKV Inspector** in dev mode shows all keys/values.
- **DB Inspector** in dev mode allows raw SQL queries.

---

## 9. Anti-patterns (do not do)

1. **Don't put large data in store slices.** Tilemaps, sprite atlases,
   and audio buffers go in refs / module-level caches, not Zustand.
2. **Don't read stores in render-heavy paths without selectors.**
3. **Don't bypass the persistence layer.** Always go through
   `saveManager`.
4. **Don't store functions in store state.** Use refs at the component
   level instead.
5. **Don't share state across slices via mutation.** Use actions that
   call other actions, or use a `rootActions` helper.

---

## 10. Testing strategy for stores

Each store has a paired test file:
- `playerStore.test.ts` — covers all actions, persistence round-trip,
  edge cases (negative gold, level cap, etc.)
- `partyStore.test.ts` — covers swap, slot conflicts, missing companions
- `inventoryStore.test.ts` — covers stack limits, unique item rules
- `progressStore.test.ts` — covers unlock graph, star computation
- `settingsStore.test.ts` — covers MMKV sync, i18n integration
- `sessionStore.test.ts` — covers modal stack, pause/resume

Test pattern:
```typescript
import { usePlayerStore } from './playerStore';
import { setupTestDb, teardownTestDb } from '@/test/helpers';

beforeEach(async () => { await setupTestDb(); });
afterEach(async () => { await teardownTestDb(); });

it('addXp triggers level up at threshold', () => {
  usePlayerStore.getState().hydrate('test_slot');
  usePlayerStore.getState().addXp(50);
  expect(usePlayerStore.getState().hero!.level).toBe(2);
});
```
