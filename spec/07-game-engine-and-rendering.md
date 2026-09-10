# 07 — Game Engine & Rendering

> **Renderer:** `@shopify/react-native-skia`
> **ECS:** manual, Bevy-inspired
> **Game loop:** fixed-timestep 60Hz

---

## 1. ECS architecture

### 1.1 Mental model

```
World
├── entities: Map<EntityId, Entity>
├── components: Map<ComponentType, Map<EntityId, Component>>
└── systems: System[]  (run in order each tick)
```

- **Entity** = a numeric ID. No data.
- **Component** = a plain data record, attached to an entity via a typed
  map (e.g., `components.position.get(entityId)`).
- **System** = a pure function that reads/writes components. Runs each tick.

### 1.2 Why ECS

- **Cache-friendly iteration.** All positions in one contiguous map.
- **Trivial serialization.** Save game = snapshot component maps.
- **System isolation.** Puzzle system, combat system, movement system
  don't know about each other.

### 1.3 Components (the 20+ types)

```typescript
// src/game/engine/ecs/components.ts

// Spatial
export type Position = { x: number; y: number };       // world coords (px)
export type Velocity = { vx: number; vy: number };     // px/sec
export type Bounds = { w: number; h: number };
export type Tile = { tx: number; ty: number };          // tile coords

// Visual
export type Sprite = {
  atlasId: string;             // e.g. 'atlas_creatures_01'
  spriteId: string;            // e.g. 'nemean_lion_idle'
  layer: number;               // z-order within a scene
  flipX: boolean;
  alpha: number;               // 0..1
  tint?: ColorKey;
};
export type Animation = {
  current: string;             // animation key
  frame: number;
  fps: number;
  loop: boolean;
  onComplete?: 'destroy' | 'callback';
};

// Physics / collision
export type Collider = {
  shape: 'box' | 'circle';
  width: number;
  height: number;
  isSolid: boolean;            // true = blocks movement, false = sensor
  tag?: 'player' | 'enemy' | 'trap' | 'puzzle_piece' | 'goal';
};

// Game logic
export type Health = {
  current: number;
  max: number;
  regen: number;               // hp/sec
  invulnMs: number;            // remaining i-frames
};
export type Stats = {
  atk: number;
  def: number;
  spd: number;
  int: number;
  lck: number;
};
export type Combat = {
  team: 'player' | 'enemy' | 'neutral';
  attackPower: number;         // cached from stats + weapon
  abilities: string[];         // ability ids
  isDefending: boolean;
};
export type AI = {
  script: 'aggressive' | 'defensive' | 'support' | 'boss_phase_1' | 'boss_phase_2';
  target?: EntityId;
  state: 'idle' | 'chase' | 'attack' | 'flee' | 'stunned';
  nextActionMs: number;        // timestamp
};

// Puzzle
export type PuzzlePiece = {
  pieceId: string;             // for path-finding or laser logic
  type: 'crate' | 'goal' | 'mirror' | 'laser_source' | 'target' | 'switch' | 'trap';
  state?: Record<string, unknown>;  // mechanic-specific
};

// Interaction
export type Interactable = {
  promptKey: string;           // i18n key, e.g. 'interact.chest'
  onInteract: 'open_chest' | 'enter_door' | 'activate_switch' | 'dialogue';
  payload?: Record<string, unknown>;
};

// Lifetime
export type Lifetime = { remainingMs: number };     // for projectiles
export type Persist = { tag: string };              // for save-on-exit

// Player
export type PlayerControlled = { playerId: string };
export type CameraFollow = { offsetX: number; offsetY: number };

// Meta
export type Tag = { name: string };                  // generic tagging
```

### 1.4 Entity creation

```typescript
// src/game/engine/ecs/world.ts
class World {
  createEntity(): EntityId {
    const id = this.nextId++;
    this.entities.set(id, { id, components: new Set() });
    return id;
  }

  addComponent<T>(entity: EntityId, type: ComponentType<T>, data: T): void {
    this.components[type].set(entity, data);
    this.entities.get(entity)!.components.add(type);
  }

  removeComponent<T>(entity: EntityId, type: ComponentType<T>): void {
    this.components[type].delete(entity);
    this.entities.get(entity)!.components.delete(type);
  }

  destroyEntity(entity: EntityId): void {
    const e = this.entities.get(entity);
    if (!e) return;
    for (const type of e.components) {
      this.components[type].delete(entity);
    }
    this.entities.delete(entity);
  }
}
```

### 1.5 Systems (in order, each tick)

```typescript
// src/game/engine/ecs/systems.ts
const SYSTEMS = [
  InputSystem,           // read input → intent
  MovementSystem,        // intent + velocity → position (collision check)
  AISystem,              // for each AI entity, decide next action
  AnimationSystem,       // advance sprite animation frames
  PuzzleSystem,          // for each active puzzle, step
  CombatSystem,          // for each combat-active entity, attack if ready
  HealthSystem,          // regen, invuln tick, death check
  LifetimeSystem,        // destroy expired entities
  CameraSystem,          // follow player, update camera
  RenderSystem,          // emit draw list for Skia
];
```

Each system is a function `(world, dt) => void`. They run in order.
The `RenderSystem` does NOT draw — it produces a draw list that the
Skia layer consumes.

---

## 2. Game loop

```typescript
// src/game/engine/loop/GameLoop.ts
import { World } from '../ecs/world';
import { SYSTEMS } from '../ecs/systems';
import { useSessionStore } from '@/data/stores/sessionStore';

export class GameLoop {
  private world: World;
  private accumulator = 0;
  private readonly FIXED_DT = 1 / 60;
  private readonly MAX_DT = 1 / 10;          // clamp to avoid spiral of death
  private lastTime = 0;
  private rafHandle: number | null = null;
  private isPaused = false;

  constructor(world: World) { this.world = world; }

  start() {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - this.lastTime) / 1000, this.MAX_DT);
      this.lastTime = now;
      if (!this.isPaused) this.step(delta);
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
  }

  setPaused(paused: boolean) { this.isPaused = paused; }

  private step(dt: number) {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.FIXED_DT && steps < 5) {
      for (const sys of SYSTEMS) sys(this.world, this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
      steps++;
    }
    if (steps >= 5) this.accumulator = 0;     // drop excess

    // Render at variable rate
    this.render();
  }

  private render() {
    // Emit draw list, hand to Skia layer
    const drawList = this.world.renderSystem.produce();
    useRenderBus.getState().setDrawList(drawList);
  }
}
```

### 2.1 Pause behavior

The game loop checks `sessionStore.isPaused` AND `useAppState` (background
state). When paused, the loop still runs (to keep animations smooth on
resume) but skips the system step.

---

## 3. Skia rendering

### 3.1 Canvas root

```typescript
// src/game/render/canvas/GameCanvas.tsx
import { Canvas, useCanvasRef } from '@shopify/react-native-skia';

export function GameCanvas() {
  const ref = useCanvasRef();
  const drawList = useRenderBus((s) => s.drawList);

  return (
    <Canvas ref={ref} style={StyleSheet.absoluteFill}>
      <DrawListRenderer drawList={drawList} />
    </Canvas>
  );
}
```

### 3.2 Draw list

The render system produces a flat list of draw commands:

```typescript
type DrawCommand =
  | { type: 'sprite'; atlas: string; spriteId: string; x: number; y: number; w: number; h: number; flipX: boolean; alpha: number; layer: number; tint?: string }
  | { type: 'tile'; tileId: string; tx: number; ty: number; layer: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string; layer: number }
  | { type: 'text'; text: string; x: number; y: number; size: number; color: string; align: CanvasTextAlign; layer: number }
  | { type: 'particle'; particleId: string; x: number; y: number; ageMs: number; layer: number }
  | { type: 'shake'; intensity: number; duration: number };

type DrawList = DrawCommand[];
```

Commands are sorted by `layer` (ascending = back to front) before
rendering.

### 3.3 Sprite rendering

Each sprite is one draw call. Skia batches via shared paint objects.

```typescript
// src/game/render/sprites/SpriteSheet.ts
import { useImage, Image } from '@shopify/react-native-skia';

export class SpriteSheet {
  private image;
  private manifest: SpriteManifest;

  static async load(atlasId: string): Promise<SpriteSheet> {
    const image = useImage(require(`@/../assets/sprites/${atlasId}.png`));
    const manifest = require(`@/../assets/sprites/${atlasId}.json`);
    return new SpriteSheet(image, manifest);
  }

  getSpriteRect(spriteId: string): { x: number; y: number; w: number; h: number } {
    const s = this.manifest.sprites[spriteId];
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}
```

Sprites in a 1024×1024 atlas at 16×16 → 64×64 = 4096 sprites per sheet.
The manifest is generated by the bake script.

### 3.4 Tile rendering

Tile maps use a single `Image` of the tileset + per-tile `rect` sampling.
Optimization: adjacent identical tiles merge into a single draw call
using `ImageRect` of the merged area.

```typescript
// Pseudocode
const rows = groupByRow(tiles);
for (const row of rows) {
  // merge horizontal runs of same tileId into one ImageRect
  // emits at most (rows * runs) draw calls
}
```

Typical overworld (256×192 tiles, ~50% unique): ~1000 draw calls,
~50 merged runs → ~50 actual `ImageRect` calls. Well within Skia budget.

### 3.5 Camera

```typescript
// src/game/render/canvas/Camera.ts
export class Camera {
  x: number = 0;          // world x at top-left of viewport
  y: number = 0;
  zoom: number = 1;       // for zoom-in effects, 1.0 default
  viewportW: number;
  viewportH: number;

  follow(target: { x: number; y: number }, dt: number) {
    const targetX = target.x - this.viewportW / 2;
    const targetY = target.y - this.viewportH / 2;
    // smooth lerp
    this.x += (targetX - this.x) * Math.min(1, dt * 5);
    this.y += (targetY - this.y) * Math.min(1, dt * 5);
  }
}
```

### 3.6 Screen shake

```typescript
export class ScreenShake {
  trauma = 0;             // 0..1

  add(intensity: number) { this.trauma = Math.min(1, this.trauma + intensity); }
  decay(dt: number) { this.trauma = Math.max(0, this.trauma - dt * 2); }

  offset(): { x: number; y: number } {
    const t = this.trauma * this.trauma;
    return {
      x: (Math.random() - 0.5) * t * 20,
      y: (Math.random() - 0.5) * t * 20,
    };
  }
}
```

### 3.7 Particles

Particle system is a pool of 200 entities, each with `Lifetime` +
`Velocity` + `Sprite`. Emitters (sword hits, magic bursts) create
particles; the `LifetimeSystem` destroys them when expired.

### 3.8 Effects (Skia shaders)

For MVP, we use 3 Skia effects:
- **Flash** (white overlay, fade out 200ms) — for damage, level-up
- **Chromatic aberration** (subtle, 4px offset) — for low-HP warning
- **Scanlines** (CRT effect, 1px alpha 0.05) — for cinematics

These are applied as a top-level Skia group with `BlendMode` and a
custom shader (where needed).

---

## 4. Input

### 4.1 Virtual joystick

Bottom-left of the screen. Rendered with Reanimated. Touch area:
200×200 box, but visual joystick is 100px diameter. Movement vector
normalized to [0..1] magnitude.

```typescript
// src/game/render/input/Joystick.tsx
export function Joystick() {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const active = useSharedValue(false);

  const gesture = Gesture.Pan()
    .onBegin(() => { active.value = true; })
    .onUpdate((e) => { x.value = e.translationX; y.value = e.translationY; })
    .onEnd(() => { active.value = false; x.value = 0; y.value = 0; });

  // emits direction to input system
}
```

Direction is published to a small `inputStore` (Zustand) that
`MovementSystem` reads each tick.

### 4.2 Action buttons

Bottom-right: 4 buttons (Attack, Special, Item, Pause). 56×56 each,
positioned in a diamond layout (or 2x2 grid).

Press triggers `CombatSystem.queueAction()`.

### 4.3 Tap-to-move (puzzle rooms)

In puzzle rooms, the joystick is hidden; the player taps tiles to
move. This is implemented as a tap gesture on the game canvas that
emits a `TapIntent` to the input system.

### 4.4 Keyboard (iPad / Android tablet)

For larger screens, hardware keyboard support:
- WASD / arrow keys → movement
- Space / J → attack
- K → special
- I → inventory
- Esc → pause

Implemented via `react-native-keyevent` (Android) and built-in
`onKeyDown` (iOS). Not advertised — just available.

---

## 5. Scene management

```typescript
// src/game/engine/scene/SceneManager.ts
export class SceneManager {
  private world: World;
  private current: SceneSpec | null = null;

  loadScene(spec: SceneSpec) {
    // 1. Save current scene's persistent entities
    // 2. Destroy transient entities
    // 3. Create new entities from spec
    // 4. Reset camera
    // 5. Reset input
    // 6. Trigger audio cross-fade to spec.music
  }
}

type SceneSpec = {
  type: 'overworld' | 'level' | 'boss' | 'hub';
  id: string;
  tilemap?: string;
  entities: EntitySpec[];
  music: string;
  ambience?: string;
  ambientLight?: 'day' | 'dusk' | 'night' | 'torch' | 'underworld';
  playerSpawn: { x: number; y: number };
};
```

### 5.1 Scene lifecycle

1. `BootGate` loads `Hub` scene (minimal: just temple + UI).
2. User taps "Depart" → `loadScene({ type: 'overworld', id: 'act1_overworld' })`.
3. User taps a puzzle marker → `loadScene({ type: 'level', id: 'act1_area1_room1' })`.
4. User solves → returns to overworld.
5. User taps boss marker → `loadScene({ type: 'boss', id: 'nemean_lion' })`.
6. User wins → `loadScene({ type: 'overworld', id: 'act1_overworld' })` (with boss defeated flag).

### 5.2 Loading screen

Scene load takes 100-300ms (entity creation, audio prep). During this
time, a small Skia "loading column" animation is shown. The previous
scene is not destroyed until the new one is ready (cross-fade 200ms).

---

## 6. Animation system

### 6.1 Frame-based animation

Each `Animation` component points to a sequence of sprite frames
(in the atlas manifest). The `AnimationSystem` advances `frame` based
on `dt * fps`, looping or completing based on flags.

```typescript
// Atlas manifest
{
  "nemean_lion_idle": {
    "frames": ["lion_0", "lion_1", "lion_2", "lion_3"],
    "fps": 6,
    "loop": true
  },
  "nemean_lion_attack": {
    "frames": ["lion_a0", "lion_a1", "lion_a2"],
    "fps": 12,
    "loop": false,
    "onComplete": "callback"
  }
}
```

### 6.2 Required animations per entity

| Entity | Idle | Walk | Attack | Hit | Death |
|---|---|---|---|---|---|
| Hero | ✓ | ✓ | ✓ | ✓ | ✓ |
| Companion | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enemy | ✓ | — | ✓ | ✓ | ✓ |
| Boss | ✓ | — | ✓ | ✓ | ✓ (multi-part) |
| NPC | ✓ | — | — | — | — |
| Prop | (1 frame) | — | — | — | — |

Total: ~5 base animations × 14 enemies + 1 hero + 4 companions ×
~5 each = ~95 unique animation sequences in the manifest.

---

## 7. Asset references in code

Code never embeds raw image data. It references atlas IDs and sprite
IDs:

```typescript
world.addComponent(entity, 'sprite', {
  atlasId: 'atlas_creatures_01',
  spriteId: 'nemean_lion_idle',
  layer: 5,
  flipX: false,
  alpha: 1,
});
```

The manifest (in `assets/sprites/atlas_creatures_01.json`) maps
`'nemean_lion_idle'` to the actual frame coordinates. **Adding new
sprites never requires code changes** — only manifest + atlas update.

---

## 8. Performance

- **Render budget:** 16.67ms per frame (60fps).
- **Target draw calls:** <500 per frame.
- **Entity count budget:** <500 entities per scene.
- **Sprite batch:** all sprites using the same atlas share a single
  `Image` and paint object.
- **Particle pool:** 200 max, recycled.
- **Off-screen culling:** entities outside camera viewport are not
  drawn.
- **LOD:** enemies far from camera render at 50% scale with no animation
  (1 frame).

The render system measures its own perf and logs a warning if a frame
exceeds 12ms.

---

## 9. Debug overlay (dev only)

In `__DEV__`, a debug overlay shows:
- FPS (current, p95, p99)
- Entity count
- Draw call count
- JS thread tick time
- Memory usage

Toggle with 3-finger tap. **Never** ships in release builds.
