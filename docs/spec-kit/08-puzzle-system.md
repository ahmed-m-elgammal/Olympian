# 08 — Puzzle System

> **6 mechanics, each with a TypeScript contract, a config schema, a level
> template, and a render rule.** A build agent can pick any single mechanic
> and implement it without reading the others.

---

## 1. The 6 mechanics (overview)

| # | Mechanic | Genre | Input | Skill axis |
|---|---|---|---|---|
| 1 | **Reflex** | Trap-dodge, fast-tap | Tap direction | Hand-eye |
| 2 | **Sequence** | Simon-says, pattern memory | Tap tiles in order | Memory |
| 3 | **Path** | Sokoban-style push | Swipe direction | Spatial planning |
| 4 | **Timing** | Rhythm-tap on a moving bar | Tap | Rhythm |
| 5 | **Logic** | Constraint satisfaction (laser/mirror/switch) | Drag & drop | Logic |
| 6 | **Maze** | Recursive labyrinth | Joystick drag | Pathfinding |

Each mechanic is implemented as a class that conforms to the
`PuzzleMechanic` interface. New mechanics can be added by adding a new
class — no engine changes.

---

## 2. Common contract

```typescript
// src/game/systems/puzzle/PuzzleMechanic.ts
export interface PuzzleMechanic<TCfg, TState, TInput, TResult> {
  readonly id: string;                        // 'reflex' | 'sequence' | ...
  readonly displayNameKey: string;            // i18n key

  // Initialize from level config
  init(config: TCfg, rng: SeededRNG): TState;

  // Apply one input, return new state and result
  step(state: TState, input: TInput, dt: number): PuzzleStepResult<TState, TResult>;

  // Check if state is solved
  isSolved(state: TState): boolean;

  // Check if state is failed
  isFailed(state: TState): boolean;

  // Hint: returns the next correct input (if available)
  hint(state: TState): TInput | null;

  // Serialize state for save/restore
  serialize(state: TState): string;
  deserialize(json: string): TState;

  // Render: produce draw commands for Skia
  render(state: TState, hud: PuzzleHUDContext): DrawCommand[];
}

export type PuzzleStepResult<TState, TResult> =
  | { kind: 'continue'; state: TState }
  | { kind: 'solved'; state: TState; result: TResult }
  | { kind: 'failed'; state: TState; reason: PuzzleFailReason };

export type PuzzleFailReason =
  | 'timeout'
  | 'wrong_input'
  | 'out_of_health'
  | 'trap_triggered';
```

### 2.1 `PuzzleManager`

```typescript
// src/game/systems/puzzle/PuzzleManager.ts
export class PuzzleManager {
  private current: ActivePuzzle | null = null;

  start(mechanicId: string, config: unknown): void {
    const mech = PuzzleRegistry.get(mechanicId);
    const rng = new SeededRNG(hashConfig(config));
    const state = mech.init(config, rng);
    this.current = {
      mechanic: mech,
      state,
      config,
      startedAt: Date.now(),
      attempts: 1,
      hintsUsed: 0,
    };
  }

  step(input: unknown, dt: number): PuzzleStepResult<unknown, unknown> {
    if (!this.current) throw new Error('No active puzzle');
    return this.current.mechanic.step(this.current.state, input, dt);
  }

  hint(): unknown {
    if (!this.current) return null;
    this.current.hintsUsed++;
    return this.current.mechanic.hint(this.current.state);
  }
}
```

---

## 3. Reflex (mechanic 1)

### 3.1 Concept

A grid (8×8) of tiles. Some tiles are safe (light), some are traps
(dark, animated). The player moves a 1-tile avatar across the grid
within a time budget. Touching a trap = fail.

### 3.2 Config schema

```typescript
type ReflexConfig = {
  width: 6 | 8 | 10 | 12;             // grid width in tiles
  height: 6 | 8 | 10 | 12;            // grid height
  timeBudgetMs: number;               // total time (e.g. 12000)
  trapCount: number;                  // number of trap tiles
  startTile: { x: number; y: number };
  endTile: { x: number; y: number };
  // Forbid paths to ensure solvability
  forbiddenTiles?: Array<{ x: number; y: number }>;
  // Optional power-ups
  hasFreeze?: boolean;                // freeze traps for 2s, 1 use
};
```

### 3.3 State

```typescript
type ReflexState = {
  config: ReflexConfig;
  avatar: { x: number; y: number };
  traps: Set<string>;                // "x,y" keys
  elapsedMs: number;
  freezeUsed: boolean;
  freezeRemainingMs: number;         // 0 if not frozen
  status: 'playing' | 'won' | 'lost';
};
```

### 3.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  if (input.type === 'move' && state.status === 'playing') {
    const { dx, dy } = input;
    const nx = state.avatar.x + dx;
    const ny = state.avatar.y + dy;
    if (inBounds(nx, ny, state.config)) {
      state.avatar = { x: nx, y: ny };
      if (state.traps.has(key(nx, ny)) && state.freezeRemainingMs === 0) {
        state.status = 'lost';
        return { kind: 'failed', state, reason: 'trap_triggered' };
      }
      if (nx === state.config.endTile.x && ny === state.config.endTile.y) {
        state.status = 'won';
        return { kind: 'solved', state, result: { timeMs: state.elapsedMs } };
      }
    }
  }
  if (input.type === 'freeze' && !state.freezeUsed) {
    state.freezeUsed = true;
    state.freezeRemainingMs = 2000;
  }
  state.elapsedMs += dt * 1000;
  if (state.freezeRemainingMs > 0) {
    state.freezeRemainingMs = Math.max(0, state.freezeRemainingMs - dt * 1000);
  }
  if (state.elapsedMs >= state.config.timeBudgetMs) {
    state.status = 'lost';
    return { kind: 'failed', state, reason: 'timeout' };
  }
  return { kind: 'continue', state };
}
```

### 3.5 Render

- Safe tiles: light beige square
- Trap tiles: dark square with red pulsing dot (Skia animation)
- Avatar: hero sprite
- Path trail: faint line of previous positions
- HUD: timer bar, hearts (3 lives)

### 3.6 Trap generation

`init` uses seeded RNG to place `trapCount` traps, excluding `startTile`,
`endTile`, and `forbiddenTiles`. Ensures a path from start to end
exists (BFS check). If no path, regenerate.

### 3.7 Difficulty scaling

| Tier | Grid | Traps | Time |
|---|---|---|---|
| 1 | 6×6 | 4 | 10s |
| 2 | 8×8 | 10 | 14s |
| 3 | 10×10 | 18 | 20s |

---

## 4. Sequence (mechanic 2)

### 4.1 Concept

3-4 colored tiles light up in a pattern. Player must tap them in the
same order. Each successful round adds 1 to the pattern. Failure =
restart from pattern length 3.

### 4.2 Config schema

```typescript
type SequenceConfig = {
  tiles: 3 | 4 | 5;                   // number of colored tiles
  startLength: 2 | 3 | 4;
  maxLength: 6 | 8 | 10;
  paceMs: number;                     // time per tile in the demo (e.g. 600)
  mistakeTolerance: 0 | 1 | 2;        // wrong taps before reset
};
```

### 4.3 State

```typescript
type SequenceState = {
  config: SequenceConfig;
  pattern: number[];                  // tile indices in the demo order
  playerInput: number[];              // what the player tapped
  currentLength: number;              // current pattern length
  phase: 'showing' | 'awaiting' | 'won' | 'lost';
  demoProgress: number;               // index of tile being shown
  demoElapsedMs: number;
  awaitingElapsedMs: number;
  mistakes: number;
};
```

### 4.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  if (state.phase === 'showing') {
    state.demoElapsedMs += dt * 1000;
    if (state.demoElapsedMs >= state.config.paceMs) {
      state.demoElapsedMs = 0;
      state.demoProgress++;
      if (state.demoProgress >= state.pattern.length) {
        state.phase = 'awaiting';
        state.awaitingElapsedMs = 0;
      }
    }
    return { kind: 'continue', state };
  }
  if (state.phase === 'awaiting' && input.type === 'tap') {
    state.playerInput.push(input.tileIndex);
    const idx = state.playerInput.length - 1;
    if (state.playerInput[idx] !== state.pattern[idx]) {
      state.mistakes++;
      if (state.mistakes > state.config.mistakeTolerance) {
        state.phase = 'lost';
        return { kind: 'failed', state, reason: 'wrong_input' };
      }
      // restart current pattern
      state.playerInput = [];
      state.phase = 'showing';
      state.demoProgress = 0;
      state.demoElapsedMs = 0;
    } else if (state.playerInput.length === state.pattern.length) {
      if (state.pattern.length >= state.config.maxLength) {
        state.phase = 'won';
        return { kind: 'solved', state, result: { length: state.pattern.length } };
      }
      // extend pattern
      state.currentLength++;
      state.pattern.push(rng.int(0, state.config.tiles - 1));
      state.playerInput = [];
      state.phase = 'showing';
      state.demoProgress = 0;
      state.demoElapsedMs = 0;
    }
  }
  if (state.phase === 'awaiting') {
    state.awaitingElapsedMs += dt * 1000;
    if (state.awaitingElapsedMs > 8000) {     // 8s of inactivity
      state.phase = 'lost';
      return { kind: 'failed', state, reason: 'timeout' };
    }
  }
  return { kind: 'continue', state };
}
```

### 4.5 Render

- Tile buttons at the corners of the puzzle area
- Showing phase: each tile pulses in sequence, scale 1.0 → 1.2 → 1.0
- Awaiting phase: tiles are tappable, dim until tapped
- HUD: "Round X of Y" + mistakes remaining

### 4.6 Difficulty scaling

| Tier | Tiles | Start | Max | Pace | Mistakes |
|---|---|---|---|---|---|
| 1 | 3 | 2 | 5 | 800ms | 2 |
| 2 | 4 | 3 | 7 | 600ms | 1 |
| 3 | 5 | 4 | 10 | 450ms | 0 |

---

## 5. Path (mechanic 3)

### 5.1 Concept

Sokoban-style. Push crates onto goal tiles. Player avatar is 1 tile,
moves with swipe gestures. Crates slide 1 tile at a time.

### 5.2 Config schema

```typescript
type PathConfig = {
  width: 6 | 8 | 10;
  height: 6 | 8 | 10;
  walls: Array<{ x: number; y: number }>;     // immovable
  cratesStart: Array<{ x: number; y: number }>;
  goals: Array<{ x: number; y: number }>;
  playerStart: { x: number; y: number };
  moveLimit: number;                          // max moves
};
```

### 5.3 State

```typescript
type PathState = {
  config: PathConfig;
  player: { x: number; y: number };
  crates: Array<{ x: number; y: number }>;
  moves: number;
  status: 'playing' | 'won' | 'lost';
};
```

### 5.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  if (input.type !== 'move' || state.status !== 'playing') return continue;
  const { dx, dy } = input;
  const nx = state.player.x + dx, ny = state.player.y + dy;
  if (!inBounds(nx, ny) || isWall(nx, ny)) return continue;
  const crateIdx = state.crates.findIndex(c => c.x === nx && c.y === ny);
  if (crateIdx >= 0) {
    const cnx = nx + dx, cny = ny + dy;
    if (!inBounds(cnx, cny) || isWall(cnx, cny) ||
        state.crates.some(c => c.x === cnx && c.y === cny)) {
      return continue;       // can't push
    }
    state.crates[crateIdx] = { x: cnx, y: cny };
  }
  state.player = { x: nx, y: ny };
  state.moves++;
  if (state.moves >= state.config.moveLimit) {
    state.status = 'lost';
    return { kind: 'failed', state, reason: 'out_of_health' };
  }
  if (state.config.goals.every(g =>
        state.crates.some(c => c.x === g.x && c.y === g.y))) {
    state.status = 'won';
    return { kind: 'solved', state, result: { moves: state.moves } };
  }
  return { kind: 'continue', state };
}
```

### 5.5 Render

- Walls: dark marble blocks
- Crates: wooden boxes with grain detail
- Goals: glowing circles (subtle Skia radial gradient)
- Player: hero sprite
- HUD: moves remaining

### 5.6 Difficulty scaling

| Tier | Grid | Crates | Move limit |
|---|---|---|---|
| 1 | 6×6 | 2 | 30 |
| 2 | 8×8 | 4 | 60 |
| 3 | 10×10 | 5 | 100 |

---

## 6. Timing (mechanic 4)

### 6.1 Concept

A horizontal bar scrolls a marker left-to-right (right-to-left in RTL).
Player taps when the marker is in the "green zone." Tighter taps = more
points. Hit 10 in a row to solve.

### 6.2 Config schema

```typescript
type TimingConfig = {
  barSpeed: number;                   // px/sec (300, 450, 600)
  greenZoneStart: number;             // 0..1 (start of green)
  greenZoneEnd: number;               // 0..1 (end of green)
  requiredHits: 5 | 10 | 15;
  hitsToLose: number;                 // misses allowed
  isReversed?: boolean;               // scroll right-to-left (RTL default)
};
```

### 6.3 State

```typescript
type TimingState = {
  config: TimingConfig;
  markerPos: number;                  // 0..1
  hits: number;
  misses: number;
  lastResult: 'perfect' | 'good' | 'miss' | null;
  status: 'playing' | 'won' | 'lost';
};
```

### 6.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  // Always advance marker
  if (state.config.isReversed) {
    state.markerPos -= state.config.barSpeed * dt;
    if (state.markerPos < 0) state.markerPos = 1;
  } else {
    state.markerPos += state.config.barSpeed * dt;
    if (state.markerPos > 1) state.markerPos = 0;
  }
  if (input.type === 'tap') {
    const inGreen = state.markerPos >= state.config.greenZoneStart &&
                    state.markerPos <= state.config.greenZoneEnd;
    const distFromCenter = Math.abs(
      state.markerPos - (state.config.greenZoneStart + state.config.greenZoneEnd) / 2
    );
    const zoneWidth = state.config.greenZoneEnd - state.config.greenZoneStart;
    if (!inGreen) {
      state.misses++;
      state.lastResult = 'miss';
    } else if (distFromCenter < zoneWidth * 0.2) {
      state.hits++;
      state.lastResult = 'perfect';
    } else {
      state.hits++;
      state.lastResult = 'good';
    }
    if (state.hits >= state.config.requiredHits) {
      state.status = 'won';
      return { kind: 'solved', state, result: { hits: state.hits, misses: state.misses } };
    }
    if (state.misses >= state.config.hitsToLose) {
      state.status = 'lost';
      return { kind: 'failed', state, reason: 'wrong_input' };
    }
  }
  return { kind: 'continue', state };
}
```

### 6.5 Render

- Horizontal bar (full width minus margins)
- Green zone: subtle gradient
- Marker: vertical line, animated
- Hit feedback: brief flash (perfect = gold, good = green, miss = red)
- HUD: hits "X/10", misses (hearts)

### 6.6 Difficulty scaling

| Tier | Speed | Green width | Required | Misses |
|---|---|---|---|---|
| 1 | 300 | 0.3 | 5 | 5 |
| 2 | 450 | 0.2 | 10 | 4 |
| 3 | 600 | 0.12 | 15 | 3 |

---

## 7. Logic (mechanic 5)

### 7.1 Concept

A grid of components: laser sources, mirrors, targets, switches, walls.
The player must orient mirrors and toggle switches to direct a laser
beam from source to target.

### 7.2 Config schema

```typescript
type LogicConfig = {
  width: 5 | 7 | 9;
  height: 5 | 7 | 9;
  walls: Array<{ x: number; y: number }>;
  sources: Array<{ x: number; y: number; direction: 0|1|2|3 }>;
  targets: Array<{ x: number; y: number }>;
  mirrors: Array<{ x: number; y: number; initialRotation: 0|1|2|3 }>;
  switches: Array<{ x: number; y: number; initiallyOn: boolean;
                    gatesWallId: string }>;
  rotatableMirrors: number;            // how many mirrors the player can rotate
};
```

`direction`: 0=right, 1=down, 2=left, 3=up.

### 7.3 State

```typescript
type LogicState = {
  config: LogicConfig;
  mirrors: Array<{ x: number; y: number; rotation: 0|1|2|3 }>;
  switchStates: Map<string, boolean>;
  beams: Beam[];                       // current beam paths
  rotationsUsed: number;
  status: 'playing' | 'won' | 'lost';
};

type Beam = {
  x: number; y: number;
  direction: 0|1|2|3;
  path: Array<{ x: number; y: number }>;
  ended: boolean;
};
```

### 7.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  if (input.type === 'rotate_mirror') {
    if (state.rotationsUsed >= state.config.rotatableMirrors) return continue;
    const m = state.mirrors[input.mirrorIndex];
    m.rotation = (m.rotation + 1) % 4;
    state.rotationsUsed++;
    this.recomputeBeams(state);
  }
  if (input.type === 'toggle_switch') {
    const sw = state.config.switches[input.switchIndex];
    state.switchStates.set(sw.gatesWallId, !state.switchStates.get(sw.gatesWallId));
    this.recomputeBeams(state);
  }
  if (state.config.targets.every(t =>
        state.beams.some(b => b.path.some(p => p.x === t.x && p.y === t.y)))) {
    state.status = 'won';
    return { kind: 'solved', state, result: {} };
  }
  return { kind: 'continue', state };
}

recomputeBeams(state) {
  state.beams = [];
  for (const src of state.config.sources) {
    const beam = traceBeam(src, state);
    state.beams.push(beam);
  }
}

traceBeam(source, state): Beam {
  let x = source.x, y = source.y, dir = source.direction;
  const path = [{ x, y }];
  for (let i = 0; i < 100; i++) {
    const nx = x + dx(dir), ny = y + dy(dir);
    if (!inBounds(nx, ny, state) || isWall(nx, ny, state, /*respectGates*/ true)) break;
    path.push({ x: nx, y: ny });
    const mirror = state.mirrors.find(m => m.x === nx && m.y === ny);
    if (mirror) {
      dir = reflect(dir, mirror.rotation);
    }
    x = nx; y = ny;
  }
  return { x: source.x, y: source.y, direction: source.direction, path, ended: true };
}
```

### 7.5 Render

- Tiles: light marble
- Walls: dark blocks
- Sources: red gems
- Targets: blue gems
- Mirrors: small slanted squares (rotatable, drag to rotate 90°)
- Switches: lever sprites
- Beams: animated Skia lines (gold)

### 7.6 Difficulty scaling

| Tier | Grid | Mirrors | Rotations |
|---|---|---|---|
| 1 | 5×5 | 1 | 4 |
| 2 | 7×7 | 3 | 6 |
| 3 | 9×9 | 5 | 8 |

---

## 8. Maze (mechanic 6)

### 8.1 Concept

A recursive labyrinth (multi-level). Player navigates from entrance to
center. Dead ends cost 1 heart. Hitting a minotaur in the maze = fail.

### 8.2 Config schema

```typescript
type MazeConfig = {
  width: 11 | 15 | 21;                // odd only
  height: 11 | 15 | 21;
  cells: Array<{ x: number; y: number; walls: { n: boolean; e: boolean; s: boolean; w: boolean } }>;
  entrance: { x: number; y: number };
  center: { x: number; y: number };
  hearts: 1 | 2 | 3;
  minotaurPatrols?: Array<{ x: number; y: number; path: Array<{x:number;y:number}> }>;
  fogOfWar?: boolean;                  // tiles beyond 3 are dim
};
```

### 8.3 State

```typescript
type MazeState = {
  config: MazeConfig;
  player: { x: number; y: number };
  minotaurs: Array<{ x: number; y: number; pathIdx: number }>;
  hearts: number;
  status: 'playing' | 'won' | 'lost';
  visitedCells: Set<string>;
};
```

### 8.4 Step function (pseudocode)

```typescript
step(state, input, dt) {
  if (input.type === 'move') {
    const cell = state.config.cells[key(state.player.x, state.player.y)];
    const { dx, dy } = input;
    if (canPass(cell, dx, dy)) {
      state.player.x += dx;
      state.player.y += dy;
      state.visitedCells.add(key(state.player.x, state.player.y));
    } else {
      // bumping a wall: small feedback, no penalty
    }
    if (state.player.x === state.config.center.x &&
        state.player.y === state.config.center.y) {
      state.status = 'won';
      return { kind: 'solved', state, result: {} };
    }
    // Check minotaur
    for (const m of state.minotaurs) {
      if (m.x === state.player.x && m.y === state.player.y) {
        state.hearts--;
        // push player back to entrance
        state.player = { ...state.config.entrance };
        if (state.hearts <= 0) {
          state.status = 'lost';
          return { kind: 'failed', state, reason: 'out_of_health' };
        }
      }
    }
  }
  // Move minotaurs
  for (const m of state.minotaurs) {
    m.pathIdx = (m.pathIdx + 1) % m.path.length;
    m.x = m.path[m.pathIdx].x;
    m.y = m.path[m.pathIdx].y;
  }
  return { kind: 'continue', state };
}
```

### 8.5 Render

- Walls: dark stone
- Floor: light marble
- Visited cells: slightly brighter
- Unvisited cells (with fog): very dim
- Player: torch sprite
- Minotaur: red glow + skia shader
- Center: glowing exit
- HUD: hearts, "X steps to center" (after solving entrance's quadrant)

### 8.6 Difficulty scaling

| Tier | Size | Hearts | Minotaurs |
|---|---|---|---|
| 1 | 11×11 | 3 | 0 |
| 2 | 15×15 | 2 | 1 |
| 3 | 21×21 | 1 | 2 |

---

## 9. Boss-puzzle fusion

Each Act's boss has 2 phases. The boss itself is a combat entity; in
phase 2 it becomes invulnerable, and the player must solve a mini-puzzle
matching the Act's signature mechanic.

```typescript
// src/game/systems/combat/BossPhases.ts
type BossSpec = {
  id: string;
  act: number;
  hp: number;
  phase1: {
    moves: AttackMove[];                 // regular attacks
    duration: 'until_hp_half' | 'turns_5';
  };
  phase2: {
    mechanic: 'reflex' | 'sequence' | 'path' | 'timing' | 'logic' | 'maze';
    config: any;                          // mechanic-specific
    onSolve: 'damage' | 'instant_kill';
  };
  rewards: RewardSpec[];
};
```

**Locked design rule:** the boss's `phase2.mechanic` MUST equal the
Act's signature mechanic. This is enforced by content validation.

---

## 10. Hint system

- Each puzzle allows **1 free hint** (Athena's "Wisdom" — for the boss
  puzzles, companions' signature abilities grant hints in their own way).
- Hints reveal the next correct input via the `mechanic.hint()` call.
- If the player is stuck, after 2 failed attempts, a "Skip for 1 gem"
  button appears.

## 11. Save/restore

Each puzzle state can be `serialize`d to a JSON string and written to
MMKV under `session/in_progress/<levelId>`. On app background, the
in-progress state is preserved. On app resume, if the player is still
in the level, the state is restored.

A puzzle is only **committed to progress** (in the `progress` SQLite
table) when it is solved or fully failed (3 strikes). Mid-puzzle state
is ephemeral.

---

## 12. Testing

Each mechanic has a paired test file with at least:
- 5 solvable configs (verifies `isSolved` returns true after correct inputs)
- 5 unsolvable / fail-state configs
- Hint correctness
- Serialize/deserialize round-trip
- Determinism (same RNG seed = same trap layout)

```typescript
// Example: src/game/systems/puzzle/mechanics/__tests__/ReflexPuzzle.test.ts
import { ReflexPuzzle } from '../ReflexPuzzle';

it('solves when avatar reaches end tile', () => {
  const mech = new ReflexPuzzle();
  const cfg = { width: 6, height: 6, /*...*/ };
  let state = mech.init(cfg, new SeededRNG(42));
  // Move to end
  for (const input of pathToEnd) {
    const res = mech.step(state, input, 0.016);
    state = res.state;
  }
  expect(mech.isSolved(state)).toBe(true);
});
```

---

## 13. Authoring levels (puzzle configs)

Build agents producing new level JSONs must:
1. Use the exact config schema for the chosen mechanic
2. Provide a valid `puzzle.config` block
3. Reference assets that exist in `assets/sprites/` and `assets/audio/`
4. Pass `scripts/validate-content.ts` (JSON schema + asset reference check)

See [`01-game-design-document.md`](./01-game-design-document.md#content-authoring-rules).
