# 09 — RPG System

> **Style:** Light RPG — not a stat cruncher. Combat is turn-based,
> 3v3, with simple but expressive mechanics. Designed for mobile
> session length (avg fight = 2-3 minutes).

---

## 1. Core stats (locked)

Six stats. All integers. Range 1–999.

| Stat | Affects |
|---|---|
| **HP** | Health points. When 0, entity is downed. |
| **ATK** | Physical damage. |
| **DEF** | Damage reduction from physical attacks. |
| **SPD** | Determines turn order; affects dodge chance. |
| **INT** | Magical damage and ability power. |
| **LCK** | Crit chance, loot drop rate, dodge. |

### 1.1 Derived values

- **Max HP** = `base_hp + (level - 1) * 10 + vit_bonus`
- **Physical damage** = `attacker.atk * (1 - defender.def / (defender.def + 100))` (asymptotic)
- **Magical damage** = `attacker.int * (1 - defender.res / (defender.res + 100))`
- **Crit chance** = `min(0.5, attacker.lck * 0.005)` (5% per LCK, capped 50%)
- **Crit multiplier** = 1.5x
- **Dodge chance** = `min(0.4, defender.spd * 0.003 + defender.lck * 0.002)` (capped 40%)
- **Hit chance** = `clamp(0.7 + (atk_spd - def_spd) * 0.005, 0.4, 0.95)`

### 1.2 Elemental resistances (for epic+ items)

Each entity has a `resistances` map: `{ fire: 0..1, ice: 0..1, lightning: 0..1, poison: 0..1, holy: 0..1, shadow: 0..1 }`.
A value of 0 = no resistance, 1 = immune, 0.5 = 50% reduction.

---

## 2. Leveling

### 2.1 XP curve

```typescript
// src/domain/systems/leveling.ts
export function xpForLevel(level: number): number {
  // Quadratic curve: 50 * level^1.6
  return Math.floor(50 * Math.pow(level, 1.6));
}

export function xpToNext(currentXp: number, currentLevel: number): number {
  return xpForLevel(currentLevel + 1) - currentXp;
}
```

| Level | Cumulative XP |
|---|---|
| 1 → 2 | 50 |
| 2 → 3 | 152 |
| 3 → 4 | 296 |
| 5 → 6 | 660 |
| 10 → 11 | 1,990 |
| 20 → 21 | 6,130 |
| 50 → 51 | 28,300 |

### 2.2 Stat growth per level

Heroes: each level, pick 1 of 3 random stat-up offers (player chooses).

| Stat | Per level up |
|---|---|
| HP | +8 to +12 |
| ATK | +1 to +3 |
| DEF | +1 to +2 |
| SPD | +1 to +2 |
| INT | +1 to +3 |
| LCK | +0 to +1 |

Companions: auto-grown on level up, using a per-companion growth table
(seeded so it's deterministic).

### 2.3 Respec

- Player has `respec_tokens` (default 0). Token = "Apple of Eternal
  Health" reward (Act 11 boss).
- Using a token resets all level-up choices and refunds all XP.
- The level-up UI lets the player redo all choices, capped at current
  total level.

---

## 3. Combat

### 3.1 Setup

- 3v3 — player's active party vs. enemy's 3v3 (some encounters 1v1 or 2v2).
- Combat is turn-based, queue-based.
- Each combatant has a `Combat` component with current `attackPower`,
  `abilities`, and `isDefending`.

### 3.2 Turn order

Initiative is rolled at combat start: `random() + spd / 100`. Sorted
descending. Ties broken randomly.

The full turn order is shown to the player in a vertical strip on the
right side of the screen.

### 3.3 Turn structure

```
On entity's turn:
  1. Player chooses action (or AI decides)
     - Attack: target an enemy
     - Skill: target as ability specifies
     - Item: target an ally (consumes item)
     - Defend: +50% DEF for 1 turn
     - Flee: only allowed in non-boss encounters; success = 60% base
  2. Action resolves immediately
  3. Status effects tick
  4. Next entity's turn
```

### 3.4 Damage formula

```typescript
// src/domain/systems/damage.ts
export function calcPhysicalDamage(
  attacker: Stats,
  defender: Stats,
  attackerLevel: number,
  weaponAtkBonus: number = 0
): { amount: number; isCrit: boolean; dodged: boolean } {
  const dodgeChance = Math.min(0.4,
    defender.spd * 0.003 + defender.lck * 0.002
  );
  if (Math.random() < dodgeChance) {
    return { amount: 0, isCrit: false, dodged: true };
  }
  const critChance = Math.min(0.5, attacker.lck * 0.005);
  const isCrit = Math.random() < critChance;
  const baseAtk = attacker.atk + weaponAtkBonus + attackerLevel * 0.5;
  const reduction = defender.def / (defender.def + 100);
  let amount = baseAtk * (1 - reduction);
  if (isCrit) amount *= 1.5;
  // ±10% variance
  amount *= 0.9 + Math.random() * 0.2;
  return { amount: Math.floor(amount), isCrit, dodged: false };
}
```

### 3.5 Death and recovery

- When HP hits 0, the entity is "downed."
- In a 3v3 fight, downed allies can be revived with a `Revive` skill
  (consumes an item) or by resting at a hub.
- If all 3 player combatants are downed → fight lost → respawn at hub
  with 1 HP and -25% gold.

### 3.6 AI behaviors

```typescript
// src/game/systems/ai/EnemyAI.ts
type AIScript =
  | 'aggressive'    // picks lowest-HP enemy, attacks
  | 'defensive'     // defends first turn, then attacks lowest DEF
  | 'support'       // heals lowest-HP ally when below 50%
  | 'boss_phase_1'  // custom per-boss (see 3.7)
  | 'boss_phase_2'  // invulnerable; runs puzzle
  | 'flee_when_low';// flees when below 25% HP
```

AI decision logic per script is implemented as pure functions in
`src/domain/systems/ai/`.

### 3.7 Boss behaviors

Each boss has a state machine. See [`08-puzzle-system.md`](./08-puzzle-system.md#boss-puzzle-fusion).

```typescript
// src/game/systems/combat/bosses/nemean_lion.ts
const nemean_lion: BossSpec = {
  id: 'nemean_lion',
  act: 1,
  hp: 500,
  phase1: {
    moves: [
      { id: 'claw', damage: 30, type: 'physical', target: 'random_player' },
      { id: 'roar', effect: 'debuff_atk', amount: -5, duration: 2, target: 'all_players' },
      { id: 'pounce', damage: 50, type: 'physical', target: 'lowest_hp_player' },
    ],
    duration: 'until_hp_half',
  },
  phase2: {
    mechanic: 'reflex',
    config: { width: 6, height: 6, /*...*/ },
    onSolve: 'damage',     // deals 200 damage to boss (kills it from half HP)
  },
  rewards: [
    { item: 'pelt_nemea', qty: 1 },
    { xp: 1000 },
    { gold: 500 },
  ],
};
```

---

## 4. Equipment

### 4.1 Slots

6 slots per character:

| Slot | Holds |
|---|---|
| `weapon` | Swords, bows, staves |
| `helm` | Helmets, circlets |
| `body` | Armor, robes |
| `trinket` | Charms, amulets |
| `ring` | Rings |
| `relic` | Story relics (one per Act collected) |

### 4.2 Item rarities

| Rarity | Drop rate (avg) | Stat budget |
|---|---|---|
| common | 70% | 1–3 effects |
| rare | 22% | 2–4 effects |
| epic | 7% | 3–5 effects |
| legendary | 1% | 4–6 effects, unique perk |

### 4.3 Item effects

Effects are JSON-defined (see [`03-data-model-and-database.md`](./03-data-model-and-database.md#45-effects-json-shape)).
Implemented as a registry:

```typescript
// src/game/systems/items/EffectRegistry.ts
type EffectHandler = (entity: Entity, effect: Effect, ctx: EffectContext) => void;

const EFFECT_REGISTRY: Record<string, EffectHandler> = {
  'stat_mod': (e, effect) => {
    // applies stat_mod at equip time
  },
  'heal_on_hit': (e, effect, ctx) => {
    if (Math.random() < effect.chance) e.health.current += effect.amount;
  },
  // ... ~20 effect types total
};
```

### 4.4 Equipping rules

- Each slot holds 1 item.
- A character can equip at most 1 of each: weapon, helm, body, relic.
- Trinket and ring can each hold 1 (so 1 + 1 = 2 trinket/ring slots
  total).
- Unique items can only be held by 1 character at a time.
- Some items have class restrictions (e.g., "Staves only for Athena").

---

## 5. Inventory

### 5.1 Capacity

- **Grid:** 32 base slots, displayed as 4×8.
- **Stash:** +168 slots, unlocked via Act completion (1 stash page per
  Act cleared, 12 pages at full completion → 32 + 168 = 200 total).
- **Stack max:** set per item (1 for equipment, up to 99 for consumables).

### 5.2 Inventory actions

- Add (auto-stacks if room)
- Remove
- Use (consumables)
- Equip (transfers to equipment slot)
- Unequip (transfers back)
- Drop (destroys item; gold given if not unique)
- Sort (by type, rarity, name)
- Sell (in hub; gives gold equal to `value_gold`)

### 5.3 Currency

- **Gold** — primary. Used for shops (no shops at MVP; future).
- **Gems** — premium. Earned 0.5 per boss clear, 1 per Act clear. Used
  for "skip puzzle" and "revive in combat."

---

## 6. Skills

Each character has up to 4 active skills, unlocked by level:

| Slot | Unlocked at |
|---|---|
| Skill 1 (basic attack) | Level 1 |
| Skill 2 | Level 5 |
| Skill 3 | Level 12 |
| Skill 4 (ultimate) | Level 25 |

### 6.1 Skill spec

```typescript
// src/domain/models/Skill.ts
type Skill = {
  id: string;
  nameKey: string;
  descriptionKey: string;
  iconAtlas: string;
  iconId: string;
  cost: { type: 'mp' | 'hp' | 'item'; amount?: number; itemId?: string };
  cooldown: number;        // turns
  target: 'self' | 'ally' | 'enemy' | 'all_allies' | 'all_enemies' | 'lowest_hp_ally' | 'lowest_hp_enemy';
  effects: Effect[];
  animationKey: string;
  vfxKey: string;
};
```

### 6.2 Skill examples

- **Athena — Wisdom:** cost 0 MP, cooldown 0, target self. Effect: reveal
  one puzzle hint in the current room.
- **Hero — Power Strike:** cost 0 MP, cooldown 2, target 1 enemy. Damage
  = 1.5x ATK, ignores 30% of DEF.
- **Hind — Fleet Step:** cost 0 MP, cooldown 3, target self. Effect: next
  trap trigger is auto-dodged.
- **Hippolyta — War Cry:** cost 0 MP, cooldown 4, target all enemies.
  Effect: -ATK 30% for 2 turns.

### 6.3 MP (mana)

- INT-based: `max_mp = 30 + int * 2`
- Regenerates 5% per turn
- Some skills cost HP instead of MP (life-drain style)

---

## 7. Companions

### 7.1 Roster (locked)

| ID | Name | Role | Joined at |
|---|---|---|---|
| `athena` | Athena | Mage / Healer | Prologue (forced) |
| `hind` | Ceryneian Hind | Scout | Act 3 boss |
| `hippolyta` | Hippolyta | Warrior | Act 9 boss |
| `orpheus` | Orpheus | Bard (hidden) | Act 11 secret |

### 7.2 Companion stats (base, level 1)

```json
// data/seed/companions.json
{
  "athena": {
    "id": "athena",
    "nameKey": "companions.athena.name",
    "baseStats": { "hp_max": 80, "atk": 8, "def": 6, "spd": 10, "int": 16, "lck": 12 },
    "growthPerLevel": { "hp_max": 7, "atk": 1, "def": 1, "spd": 1, "int": 2, "lck": 1 },
    "abilities": ["wisdom", "divine_strike", "heal", "olympian_light"],
    "sprite": { "atlasId": "atlas_companions", "spriteId": "athena_idle" }
  },
  "hind": {
    "baseStats": { "hp_max": 90, "atk": 14, "def": 8, "spd": 18, "int": 4, "lck": 8 },
    "growthPerLevel": { "hp_max": 9, "atk": 2, "def": 1, "spd": 2, "int": 0, "lck": 1 },
    "abilities": ["fleet", "tackle", "antler_gore", "stampede"],
    "sprite": { "atlasId": "atlas_companions", "spriteId": "hind_idle" }
  },
  "hippolyta": {
    "baseStats": { "hp_max": 130, "atk": 18, "def": 14, "spd": 8, "int": 6, "lck": 6 },
    "growthPerLevel": { "hp_max": 13, "atk": 3, "def": 2, "spd": 1, "int": 0, "lck": 0 },
    "abilities": ["war_cry", "amazon_strike", "girdle_throw", "triumphant_cry"],
    "sprite": { "atlasId": "atlas_companions", "spriteId": "hippolyta_idle" }
  },
  "orpheus": {
    "baseStats": { "hp_max": 70, "atk": 10, "def": 5, "spd": 12, "int": 14, "lck": 16 },
    "growthPerLevel": { "hp_max": 7, "atk": 1, "def": 1, "spd": 1, "int": 2, "lck": 2 },
    "abilities": ["song_of_repelling", "lyric_charm", "dirge", "underworld_waltz"],
    "sprite": { "atlasId": "atlas_companions", "spriteId": "orpheus_idle" }
  }
}
```

### 7.3 Party rules

- Active party: hero + 0/1/2 companions (max 2).
- The player can swap from the hub (not in overworld).
- "Solo" mode = just the hero (no companions in active party); some
  fights are easier with companions but solo is fully viable.

---

## 8. Save/load

Every state change persists to SQLite via `saveManager` (see
[`04-state-management.md`](./04-state-management.md#persistence)).

For combat, the **mid-combat state** is held in `sessionStore` only.
If the app is killed mid-combat, the combat is forfeit (respawn at hub
with 1 HP). This is acceptable because combat lasts 2-3 minutes.

---

## 9. Balance targets (post-MVP playtest)

These are **aspirational** — final tuning requires playtest data.

| Stat | Hero at L1 | Hero at L25 | Hero at L50 |
|---|---|---|---|
| HP | 100 | 350 | 700 |
| ATK | 10 | 35 | 65 |
| DEF | 5 | 22 | 45 |
| SPD | 10 | 18 | 28 |
| INT | 10 | 22 | 40 |
| LCK | 5 | 12 | 22 |

Enemy stats scale as `level * tier_multiplier` where `tier_multiplier`
is 0.8 for trash, 1.0 for mini-bosses, 1.5 for Act bosses, 2.0 for
final boss.

---

## 10. Anti-patterns

1. **No hardcoded enemy stats in code.** Always reference the `enemies`
   table.
2. **No `Math.random()` in damage formulas** without an explicit test
   mode flag.
3. **No companion-only-restricted progression** — every Act can be
   cleared solo (verified by an internal solo-playthrough script).
4. **No silent stat changes** — every buff/debuff is visible in the
   combat UI with an icon and timer.
