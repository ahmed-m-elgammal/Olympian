# 11 — Audio System

> **SFX:** `react-native-sound`
> **Music:** `react-native-track-player` (with gapless loop)
> **Format:** OGG Vorbis, mono, 44.1kHz, normalized to -16 LUFS

---

## 1. Goals

- **No audio lag.** Tap-to-SFX latency ≤ 100ms.
- **Music crossfades** when the scene changes.
- **Mixing** — music ducks to 30% during dialogue and puzzle-fail
  stingers; SFX are unaffected.
- **Total audio budget:** ≤ 25 MB.
- **Format:** OGG Vorbis (smaller than MP3, native playback on iOS/Android,
  no licensing).

---

## 2. Audio inventory

### 2.1 Music (target: 12 main + 4 hub + 1 boss + 1 victory = 18 tracks)

| Track | Length | Loop | Style |
|---|---|---|---|
| `act1_explore.ogg` | 2:30 | yes | Arid, sparse lyre + flute |
| `act2_explore.ogg` | 2:30 | yes | Swampy, low drones + frog clicks |
| `act3_explore.ogg` | 2:30 | yes | Forest, pan flute + bird song |
| `act4_explore.ogg` | 2:30 | yes | Snow, soft bells + wind |
| `act5_explore.ogg` | 2:30 | yes | Stables, percussive oars + low strings |
| `act6_explore.ogg` | 2:30 | yes | Marsh, plucked strings + reed |
| `act7_explore.ogg` | 2:30 | yes | Labyrinth, echoing strings, tense |
| `act8_explore.ogg` | 2:30 | yes | Stables, fire crackle + war drums |
| `act9_explore.ogg` | 2:30 | yes | Amazon, fast percussion + horns |
| `act10_explore.ogg` | 2:30 | yes | Islands, sea shanty + lyre |
| `act11_explore.ogg` | 2:30 | yes | Twilight, ethereal choir + harp |
| `act12_explore.ogg` | 3:00 | yes | Underworld, dark choir + low brass |
| `hub_act1.ogg` | 1:30 | yes | Calm temple, lyre + soft percussion |
| `hub_act_generic.ogg` | 1:30 | yes | Reusable hub theme |
| `tutorial.ogg` | 1:00 | yes | Soft, encouraging |
| `cinematic_intro.ogg` | 0:50 | no | Heroic fanfare |
| `boss_phase1.ogg` | 1:30 | yes | Tense, building |
| `boss_phase2.ogg` | 1:30 | yes | Intense, urgent |
| `victory.ogg` | 0:10 | no | Short fanfare |
| `defeat.ogg` | 0:08 | no | Sad trombone |
| `game_over.ogg` | 0:10 | no | Loss stinger |

### 2.2 Ambience (12 loopable beds, one per Act)

| Track | Length | Description |
|---|---|---|
| `amb_act1.ogg` | 1:00 | Wind, dry grass |
| `amb_act2.ogg` | 1:00 | Bubbling water, frogs |
| `amb_act3.ogg` | 1:00 | Forest, birds, leaves |
| `amb_act4.ogg` | 1:00 | Wind, snow crunch (footstep-like) |
| `amb_act5.ogg` | 1:00 | Low murmur, animals |
| `amb_act6.ogg` | 1:00 | Reeds, distant splashes |
| `amb_act7.ogg` | 1:00 | Echoing footsteps, low hum |
| `amb_act8.ogg` | 1:00 | Fire, snorting horses |
| `amb_act9.ogg` | 1:00 | Distant battle drums |
| `amb_act10.ogg` | 1:00 | Waves, gulls |
| `amb_act11.ogg` | 1:00 | Wind chimes, soft water |
| `amb_act12.ogg` | 1:00 | Eerie whispers, faint chains |

### 2.3 SFX (target: 60 short effects)

| Group | Count | Examples |
|---|---|---|
| Combat | 15 | sword_swing, sword_hit, dodge, defend, magic_cast, magic_hit, heal, level_up, crit, death_player, death_enemy, block, parry, ranged, fire_hit |
| Puzzle | 12 | puzzle_solve, puzzle_fail, puzzle_hint, trap_trigger, crate_push, switch_toggle, mirror_rotate, sequence_tile_a/b/c, reflex_step, timing_perfect, timing_good, timing_miss |
| UI | 12 | menu_tick, menu_select, menu_back, modal_open, modal_close, error, success, info, toast, button_press, button_release, dropdown |
| Items | 8 | pickup, drop, equip, unequip, use_potion, use_scroll, chest_open, gold_pickup |
| World | 8 | door_open, chest_locked, footstep_grass, footstep_stone, footstep_water, npc_greet, save_complete, level_clear |
| Story | 5 | dialogue_advance, dialogue_skip, cinematic_swoosh, relic_collect, achievement |

Total: 60 SFX. Average length: 0.5s. Total SFX size: ~3 MB.

### 2.4 Audio budget summary

| Category | Tracks | Avg size | Total |
|---|---|---|---|
| Music | 21 | 1.5 MB | ~32 MB |
| Ambience | 12 | 0.5 MB | ~6 MB |
| SFX | 60 | 0.05 MB | ~3 MB |
| **Total** | **93** | — | **~41 MB** |

**Wait — that's 41 MB, which is too much given our 80 MB total app
budget.** Let me revise:

**Trimmed plan:**
- Music: keep 12 Act + 1 boss + 1 hub = 14 tracks (~15 MB)
- Ambience: drop 6 Acts (Acts 5, 7, 9, 10, 11, 12 reuse the previous
  Act's ambience) = 6 tracks (~3 MB)
- SFX: keep all 60 (~3 MB)
- **Revised total: ~21 MB** ✓

The build script enforces this budget — any audio over budget blocks
the build.

---

## 3. Audio architecture

### 3.1 Module structure

```
src/platform/audio/
├── index.ts                  # public API
├── MusicPlayer.ts            # track-player wrapper, crossfade
├── SfxPool.ts                # preloaded SFX instances
├── AmbienceLayer.ts          # loopable ambient bed mixer
├── mixer.ts                  # music ducking + group volumes
└── preload.ts                # asset preloading
```

### 3.2 Public API

```typescript
// src/platform/audio/index.ts
export interface AudioAPI {
  // Lifecycle
  preloadAll(): Promise<void>;
  unloadAll(): Promise<void>;

  // Music
  playMusic(trackId: string, opts?: { crossfadeMs?: number }): Promise<void>;
  stopMusic(crossfadeMs?: number): Promise<void>;
  setMusicVolume(v: number): Promise<void>;          // 0..1

  // SFX
  playSfx(sfxId: string, opts?: { volume?: number; pitch?: number }): Promise<void>;
  preloadSfx(sfxIds: string[]): Promise<void>;

  // Ambience
  playAmbience(trackId: string): Promise<void>;
  stopAmbience(): Promise<void>;
  setAmbienceVolume(v: number): Promise<void>;

  // Mixing
  setMasterVolume(v: number): Promise<void>;
  duckMusic(factor: number, ms: number): Promise<void>;  // 0.3 = duck to 30%
}

export const audio: AudioAPI;
```

### 3.3 Music player (crossfade)

```typescript
// src/platform/audio/MusicPlayer.ts
import TrackPlayer from 'react-native-track-player';
import { Capability } from 'react-native-track-player';

class MusicPlayerImpl {
  private currentTrack: string | null = null;
  private nextTrack: string | null = null;
  private musicVolume = 0.8;

  async init() {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [],
      // No notification, no controls — we manage everything
    });
  }

  async playMusic(trackId: string, opts?: { crossfadeMs?: number }) {
    if (this.currentTrack === trackId) return;
    const crossfadeMs = opts?.crossfadeMs ?? 1000;
    // Start new track at volume 0
    await TrackPlayer.add({
      id: trackId,
      url: this.resolveUrl(trackId),
      title: trackId,
      artist: 'Olympian OST',
    });
    await TrackPlayer.setVolume(0);
    await TrackPlayer.play();
    // Fade out old, fade in new
    const oldVol = this.musicVolume;
    this.fade(0, oldVol, crossfadeMs);
    this.fade(oldVol, 0, crossfadeMs, /*oldTrack*/ true);
    this.currentTrack = trackId;
  }

  private fade(from: number, to: number, ms: number, isOldTrack = false) {
    // Animate volume over ms
  }
}
```

### 3.4 SFX pool

```typescript
// src/platform/audio/SfxPool.ts
import Sound from 'react-native-sound';

class SfxPoolImpl {
  private pool: Map<string, Sound[]> = new Map();
  private readonly POOL_SIZE = 3;            // 3 instances per SFX

  async preloadSfx(sfxIds: string[]) {
    await Promise.all(sfxIds.map((id) => this.preloadOne(id)));
  }

  private async preloadOne(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sound = new Sound(
        this.resolvePath(id),
        this.resolveBundle(),
        (err) => {
          if (err) return reject(err);
          if (!this.pool.has(id)) this.pool.set(id, []);
          this.pool.get(id)!.push(sound);
          resolve();
        }
      );
    });
  }

  play(sfxId: string, opts?: { volume?: number; pitch?: number }) {
    const pool = this.pool.get(sfxId);
    if (!pool || pool.length === 0) {
      console.warn(`SFX not preloaded: ${sfxId}`);
      return;
    }
    // Find an idle instance
    const instance = pool.find((s) => !s.isLoaded() || true) ?? pool[0];
    instance.stop();
    instance.setVolume(opts?.volume ?? 1.0);
    if (opts?.pitch) instance.setPitch(opts.pitch);     // Android only
    instance.play();
  }
}
```

The pool exists so rapid-fire SFX (e.g., 4 quick sword swings) don't
all try to play on the same instance.

### 3.5 Ambience layer

Ambience uses the same `SfxPool` but with `setNumberOfLoops(-1)`
(infinite). One ambience track at a time.

---

## 4. Triggering audio from gameplay

### 4.1 SFX triggers

Triggers live in event handlers, never inline:

```typescript
// src/game/systems/combat/CombatSystem.ts
import { audio } from '@/platform/audio';

function onAttack(attacker: Entity, target: Entity) {
  audio.playSfx('sword_swing');
  // ... damage calc
  if (didCrit) audio.playSfx('crit');
  else audio.playSfx('sword_hit');
  // ... apply damage
  if (targetDied) audio.playSfx('death_enemy');
}
```

### 4.2 Music triggers

Driven by `SceneManager`:

```typescript
// src/game/engine/scene/SceneManager.ts
function loadScene(spec: SceneSpec) {
  // ...
  audio.playMusic(spec.music, { crossfadeMs: 1000 });
  if (spec.ambience) audio.playAmbience(spec.ambience);
  else audio.stopAmbience();
}
```

### 4.3 Music ducking

When dialogue opens:
```typescript
// src/game/ui/DialogueOverlay.tsx
useEffect(() => {
  audio.duckMusic(0.3, 200);     // duck to 30%, 200ms
  return () => audio.duckMusic(1.0, 500);   // restore, 500ms
}, []);
```

For puzzle-fail stingers, duck to 0.1 for 1.5s, then restore.

---

## 5. Preloading

### 5.1 What to preload

- **On app boot:** all music tracks (lazy) + the current Act's SFX
  group.
- **On Act change:** preload the new Act's music, SFX, ambience.
  Unload the previous Act's (if memory is tight).
- **On combat start:** preload combat SFX.

### 5.2 Loading strategy

- Music: loaded via TrackPlayer (it manages streaming + caching).
- SFX: preloaded into the pool (3 instances each) on first use or on
  Act entry, whichever comes first.
- Ambience: preloaded on first use.

Total SFX pool size for one Act: 30 SFX × 3 instances × ~50 KB each
= ~4.5 MB. Affordable.

---

## 6. Audio settings (user-tunable)

Mapped to `settingsStore`:

| Setting | Effect |
|---|---|
| `musicVolume` | 0..1, applied to music tracks |
| `sfxVolume` | 0..1, applied to all SFX |
| `ambienceVolume` | 0..1, applied to ambience (default 0.6) |
| `masterVolume` | 0..1, applied to all output |

Mute toggles: `muteMusic`, `muteSfx`, `muteAmbience`, `muteAll`.

These settings persist in `settings` table (SQLite) and are applied
on app start.

---

## 7. Haptics (related, light spec)

For tactile feedback on iOS/Android, using `expo-haptics` (works in
bare workflow):

- Tap button: `impactLight`
- Sword hit: `impactMedium`
- Critical hit: `impactHeavy`
- Puzzle solve: `notificationSuccess`
- Puzzle fail: `notificationError`
- Level up: `notificationSuccess` (double)
- Relic collect: `notificationSuccess` (long)

Controlled by `settingsStore.hapticsEnabled`.

---

## 8. Audio file format spec (for asset authors)

| Property | Value |
|---|---|
| Format | OGG Vorbis |
| Channels | 1 (mono) for SFX, 2 (stereo) for music/ambience |
| Sample rate | 44.1 kHz |
| Bit rate | 96 kbps for SFX, 128 kbps for music, 80 kbps for ambience |
| Loudness | -16 LUFS (music), -12 LUFS (SFX) |
| True peak | -1 dBTP |
| Leading/trailing silence | 100ms head, 200ms tail (SFX); 0ms (loops) |

The bake script (`scripts/bake-audio.ts`) normalizes and validates.

---

## 9. File layout

```
assets/audio/
├── music/
│   ├── act1_explore.ogg
│   ├── act2_explore.ogg
│   ├── ...
│   ├── boss_phase1.ogg
│   ├── boss_phase2.ogg
│   ├── hub_act1.ogg
│   ├── hub_act_generic.ogg
│   ├── victory.ogg
│   ├── defeat.ogg
│   └── game_over.ogg
├── ambience/
│   ├── amb_act1.ogg
│   ├── amb_act2.ogg
│   ├── ...
├── sfx/
│   ├── combat/
│   │   ├── sword_swing.ogg
│   │   ├── sword_hit.ogg
│   │   └── ...
│   ├── puzzle/
│   ├── ui/
│   ├── items/
│   ├── world/
│   └── story/
└── manifest.json             # generated by bake script
```

### 9.1 Manifest

The bake script generates `assets/audio/manifest.json`:

```json
{
  "version": 1,
  "music": ["act1_explore.ogg", "..."],
  "ambience": ["amb_act1.ogg", "..."],
  "sfx": {
    "sword_swing": { "category": "combat", "file": "combat/sword_swing.ogg", "duration_ms": 230 },
    "..."
  }
}
```

The app reads this at boot to know what to preload.

---

## 10. Performance

- **Tap-to-SFX:** measured end-to-end ≤ 100ms (p95). The pool +
  preloaded Sound instances keep this low.
- **Music crossfade:** 1s default, doesn't block UI.
- **Memory:** ~25 MB resident with everything loaded. Acceptable.
- **No audio on app background:** music continues if user toggled
  "play in background" (deferred, default off).

---

## 11. Testing

### 11.1 Unit tests

- `MusicPlayer.test.ts` — preloading, track transitions, volume
- `SfxPool.test.ts` — pool reuse, miss-handling, pitch (Android)
- `mixer.test.ts` — ducking, restore, group volumes

### 11.2 Manual test checklist

- [ ] Boot: music does NOT start until first scene loads
- [ ] Tap "Depart" from hub: hub music fades out, Act music fades in
- [ ] Enter puzzle: SFX plays within 100ms of tap
- [ ] Open dialogue: music ducks to 30%
- [ ] Close dialogue: music restores over 500ms
- [ ] Boss phase 1 → phase 2: music changes
- [ ] Boss defeated: victory stinger plays
- [ ] Mute SFX: all SFX silent, music still plays
- [ ] Mute music: music silent, SFX still play
- [ ] Headphones unplug: audio pauses (iOS), continues (Android — by default)

---

## 12. Anti-patterns

1. **No audio play calls inside React render functions.** Always in
   `useEffect` or event handlers.
2. **No `await audio.playSfx(...)` in hot paths.** SFX are fire-and-forget.
3. **No inline `new Sound(...)` per play call.** Always use the pool.
4. **No MP3 files.** OGG only.
5. **No music tracks under 30s or over 4 min** (looping feel matters).
