# 12 — Asset Pipeline

> **Authoring tool:** Piskel (free, browser-based, no signup)
> **Bake tool:** custom `scripts/bake-assets.ts`
> **Output:** sprite sheets (PNG + TexturePacker JSON), audio (OGG),
> tilesets (Tiled TMX), palettes (JSON)

---

## 1. Pipeline overview

```
assets-raw/                              # human-authored, .piskel exports
  ├── sprites/
  │   ├── hero/
  │   │   ├── idle/
  │   │   │   ├── idle_down.piskel      # Piskel project file
  │   │   │   ├── idle_up.piskel
  │   │   │   ├── idle_left.piskel
  │   │   │   └── idle_right.piskel
  │   │   ├── walk/...
  │   │   ├── attack/...
  │   │   ├── hit/...
  │   │   └── death/...
  │   ├── companions/...
  │   ├── enemies/...
  │   ├── tiles/
  │   │   ├── arid_hills/
  │   │   ├── swamp/
  │   │   ├── forest/...
  │   ├── ui/                            # 64x64 icons
  │   └── items/                         # 64x64 item icons
  ├── audio/
  │   ├── music/
  │   ├── ambience/
  │   └── sfx/
  ├── tilemaps/                          # Tiled .tmx files
  │   ├── act1_area1.tmx
  │   ├── act1_area1_room1.tmx
  │   └── ...
  └── palettes/
      ├── shared_palette.png             # 32-color reference
      ├── protan.png
      ├── deutan.png
      └── tritan.png

        ↓ scripts/bake-assets.ts (build-time, CI)

assets/                                  # bundled in the app
  ├── sprites/
  │   ├── atlas_hero.png                 # 1024x1024 sprite sheet
  │   ├── atlas_hero.json                # TexturePacker manifest
  │   ├── atlas_companions.png
  │   ├── atlas_companions.json
  │   ├── atlas_creatures_01.png         # enemies, batch 1
  │   ├── atlas_creatures_01.json
  │   ├── atlas_creatures_02.png         # enemies, batch 2
  │   ├── atlas_creatures_02.json
  │   ├── atlas_tiles.png                # all tile sets merged
  │   ├── atlas_tiles.json
  │   ├── atlas_ui_64.png
  │   └── atlas_ui_64.json
  ├── audio/
  │   └── ... (transcoded, normalized)
  ├── tilemaps/
  │   └── ... (validated)
  └── palettes/
      └── palette.json                   # 32 hex colors + names
```

---

## 2. Shared palette (the 32 colors)

Every pixel in the game is one of these 32 colors. This is the
**single most important constraint** of the entire art pipeline. It
is what makes disparate sprites look like one game.

### 2.1 Palette (locked)

```
#0e0a1f  void_black       (deepest background)
#1a1230  void_deep
#2a1f4a  void_mid
#3a2d5e  void_light
#5a4a7e  marble_dark
#7a6a9e  marble_mid
#a89cc8  marble_light
#f4ecd8  marble_ivory     (text on dark)
#2a1810  wood_dark
#5a3018  wood_mid
#8a5028  wood_light
#c08050  wood_highlight
#1a2a1a  leaf_dark
#3a5a3a  leaf_mid
#6a9a4a  leaf_light
#a8d870  leaf_highlight
#4a1a1a  cloth_dark_red
#8a3030  cloth_red
#d04848  cloth_red_light  (HP)
#4a1a3a  cloth_dark_purple
#8b4a8c  cloth_purple     (secondary)
#c068c8  cloth_purple_light
#1a1a3a  cloth_dark_blue
#3a4a8a  cloth_blue
#4a8cd0  cloth_blue_light (MP)
#3a2a1a  earth_dark
#8a5a30  earth_mid
#c8a060  earth_light
#e8b34a  gold_dark        (primary)
#f4d068  gold_light
#2a3a3a  stone_dark
#a8a8a8  stone_light
#ffffff  pure_white        (text on dark, sparingly)
#000000  pure_black        (outline only, sparingly)
```

Wait, that's 34. Let me trim to exactly 32:

```
Drop:  #ffffff (replace with #f4ecd8 for highlights)
       #2a3a3a (use #3a2d5e)
```

**Final 32 colors:**

```
void:     #0e0a1f #1a1230 #2a1f4a #3a2d5e
marble:   #5a4a7e #7a6a9e #a89cc8 #f4ecd8
wood:     #2a1810 #5a3018 #8a5028 #c08050
leaf:     #1a2a1a #3a5a3a #6a9a4a #a8d870
red:      #4a1a1a #8a3030 #d04848 #c068c8 (replaced by purple)
purple:   #4a1a3a #8b4a8c #c068c8 #1a1a3a (replaced by blue)
blue:     #1a1a3a #3a4a8a #4a8cd0 #2a1810 (replaced by wood)
gold:     #e8b34a #f4d068 #3a2a1a #8a5a30 (mixed)
earth:    #3a2a1a #8a5a30 #c8a060 #a8a8a8
stone:    #2a2a2a #a8a8a8 #000000 #f4ecd8
```

Let me clean this up properly. The 32 colors in a logical grouping:

| Group | Colors | Use |
|---|---|---|
| **void** (4) | `#0e0a1f` `#1a1230` `#2a1f4a` `#3a2d5e` | backgrounds, deep space |
| **marble** (4) | `#5a4a7e` `#7a6a9e` `#a89cc8` `#f4ecd8` | statues, columns, ivory text |
| **wood** (4) | `#2a1810` `#5a3018` `#8a5028` `#c08050` | crates, beams, doors |
| **leaf** (4) | `#1a2a1a` `#3a5a3a` `#6a9a4a` `#a8d870` | foliage, grass, nature |
| **red** (4) | `#4a1a1a` `#8a3030` `#d04848` `#f4a060` | cloth, fire, HP, danger |
| **purple** (4) | `#4a1a3a` `#8b4a8c` `#c068c8` `#e8a0e8` | divine, magic, Athena |
| **blue** (4) | `#1a2a4a` `#3a5aa8` `#4a8cd0` `#a0c8f0` | water, sky, MP, info |
| **gold** (4) | `#5a3a1a` `#8a5a30` `#e8b34a` `#f4d068` | primary, gold, sun, hero |

**Total: 32 colors. Locked.**

### 2.2 Palette reference PNG

`assets-raw/palettes/shared_palette.png` is a 32×1 strip showing all
32 colors with hex labels. Authored once. **Never change.** Bake
script reads the file and validates every sprite uses only these
colors (rejects off-palette pixels).

### 2.3 Palette JSON

`assets/palettes/palette.json` is generated by the bake script:

```json
{
  "version": 1,
  "colors": [
    { "index": 0, "hex": "#0e0a1f", "name": "void_black" },
    { "index": 1, "hex": "#1a1230", "name": "void_deep" },
    ...
    { "index": 31, "hex": "#f4d068", "name": "gold_light" }
  ]
}
```

The app uses this for color-blind mode remapping.

---

## 3. Color-blind mode palettes

For accessibility, three additional palette files map the 32 colors to
color-blind-friendly equivalents.

| Original | Protan (red-blind) | Deutan (green-blind) | Tritan (blue-blind) |
|---|---|---|---|
| `#d04848` (red) | `#a8a8a8` | `#c08050` | `#d04848` |
| `#4a1a1a` (red dark) | `#3a3a3a` | `#5a3018` | `#4a1a1a` |
| `#a8d870` (leaf light) | `#f4d068` | `#c8a060` | `#a8d870` |
| `#3a5a3a` (leaf mid) | `#8a5a30` | `#5a3a1a` | `#3a5a3a` |
| ... | ... | ... | ... |

The full mapping is in `assets-raw/palettes/{protan,deutan,tritan}.json`.
The renderer applies the mapping per pixel by replacing colors at draw
time. (Skia supports this via a `ColorFilter`.)

---

## 4. Sprite authoring (in Piskel)

### 4.1 Piskel setup (per project)

When a new sprite is started in Piskel:
1. **Resolution:** exact sprite size (e.g., 16×24 for a character).
2. **Palette:** set Piskel's palette to the 32 shared colors. Piskel
   supports custom palettes.
3. **Frame rate:** noted in filename (e.g., `walk_8fps.piskel`) but
   the actual fps is in the atlas manifest, not Piskel.
4. **Save as:** Piskel project (`.piskel`) AND PNG sprite sheet export
   (`walk.png`).

### 4.2 Frame-by-frame workflow

For a 4-frame walk cycle:
1. Author frame 1 in Piskel.
2. Use Piskel's "duplicate frame" to create frame 2.
3. Modify frame 2 (slight pose change).
4. Repeat for frames 3 and 4.
5. Set frame duration: 125ms each (8fps).
6. Export PNG sprite sheet (horizontal strip): `walk.png` is 64×24
   (4 frames × 16px wide × 24px tall).
7. Export the `.piskel` source for future editing.

### 4.3 What Piskel produces

For each animation sequence:
- **PNG:** the sprite strip (all frames in one row)
- **JSON sidecar** (optional): frame durations

The bake script reads the PNG and the Piskel-exported metadata to
build the final sprite sheet and manifest.

### 4.4 Spritesheet layout (in the final atlas)

The bake script arranges all sprites into a single 1024×1024 PNG.
Layout: a simple grid, top-left to bottom-right, 16px-aligned.

For a 16×24 character with 6 animation directions × 4–6 frames each
= ~24–36 sprites, that's 24 × 16 = 384px wide × 24 = 24px tall.
Plenty of room in a 1024×1024 sheet for all 40 hero sprites.

For tiles (16×16), a single 1024×1024 sheet holds 4096 tiles — way
more than the ~960 needed across all biomes.

### 4.5 Manifest (TexturePacker JSON format)

The bake script outputs standard TexturePacker JSON:

```json
{
  "meta": {
    "app": "olympian-bake",
    "version": "1.0.0",
    "image": "atlas_hero.png",
    "size": { "w": 1024, "h": 1024 },
    "format": "RGBA8888",
    "scale": 1
  },
  "frames": [
    {
      "filename": "hero_idle_down_0",
      "frame": { "x": 0, "y": 0, "w": 16, "h": 24 },
      "sourceSize": { "w": 16, "h": 24 },
      "duration": 250
    },
    {
      "filename": "hero_idle_down_1",
      "frame": { "x": 16, "y": 0, "w": 16, "h": 24 },
      "sourceSize": { "w": 16, "h": 24 },
      "duration": 250
    },
    // ...
    {
      "filename": "hero_walk_down",
      "frame": { "x": 0, "y": 24, "w": 96, "h": 24 },
      "sourceSize": { "w": 96, "h": 24 },
      "frames": [
        { "frame": { "x": 0, "y": 24, "w": 16, "h": 24 }, "duration": 125 },
        { "frame": { "x": 16, "y": 24, "w": 16, "h": 24 }, "duration": 125 },
        { "frame": { "x": 32, "y": 24, "w": 16, "h": 24 }, "duration": 125 },
        { "frame": { "x": 48, "y": 24, "w": 16, "h": 24 }, "duration": 125 },
        { "frame": { "x": 64, "y": 24, "w": 16, "h": 24 }, "duration": 125 },
        { "frame": { "x": 80, "y": 24, "w": 16, "h": 24 }, "duration": 125 }
      ]
    }
  ]
}
```

Animations are stored as a list of frame references with durations.
The runtime's `SpriteAnimator` reads this directly.

---

## 5. Tilemap authoring (in Tiled)

### 5.1 Tool

**Tiled Map Editor** (free, open source, desktop). Outputs `.tmx`
(Tile Map XML) and `.tsx` (Tile Map JSON).

### 5.2 Tileset

Tileset is the `assets/sprites/atlas_tiles.png` (1024×1024). Each
tile is 16×16, with a 0px margin. Tiled references this by name and
tile ID.

### 5.3 Layer structure (per tilemap)

Each tilemap has these layers, in z-order:

1. **ground** — floor, walkable
2. **ground_decor** — flowers, pebbles, cracks (no collision)
3. **walls** — solid, block movement
4. **walls_decor** — wall details (no collision)
5. **objects** — interactable (chests, doors, switches)
6. **entities** — enemy spawn points, NPC positions, player spawn
7. **overlay** — fog, lighting, transparent decor above player

### 5.4 Object properties

Objects in Tiled have custom properties:

```json
{
  "name": "chest_01",
  "type": "chest",
  "x": 256, "y": 192,
  "properties": {
    "loot": "minor_potion,minor_potion,gold_50",
    "is_trap": false
  }
}
```

The bake script reads these and generates an entities JSON for the
scene loader.

### 5.5 Tilemap file naming

`assets-raw/tilemaps/act{N}_area{M}_room{R}.tmx` for level rooms.
`act{N}_overworld.tmx` for the overworld.

Bake output: `assets/tilemaps/<name>.json` (Tiled JSON format, easier
to parse than TMX).

---

## 6. Bake script (`scripts/bake-assets.ts`)

A Node.js TypeScript script run before the RN build:

```bash
yarn assets:bake         # bake all
yarn assets:bake:sprites # sprites only
yarn assets:bake:audio   # audio only
yarn assets:bake:tiles   # tilemaps only
```

### 6.1 What it does (sprites)

1. Walk `assets-raw/sprites/`, collect all `.piskel` and `.png` files.
2. For each `.piskel`, find the exported PNG (same name).
3. Read the PNG, validate:
   - Pixels are only from the 32-color palette (else: error with diff)
   - Sprite dimensions match the expected (e.g., 16×24 for hero)
4. Composite all sprites into the appropriate atlas PNG (1024×1024).
5. Generate the manifest JSON (TexturePacker format).
6. Write to `assets/sprites/`.

### 6.2 What it does (audio)

1. Walk `assets-raw/audio/`, find all `.wav`/`.aif`/`.ogg` source files.
2. For each, transcode to OGG Vorbis at the spec'd bit rate.
3. Normalize loudness to -16 LUFS (music) / -12 LUFS (SFX).
4. Trim leading/trailing silence (SFX only).
5. Generate `assets/audio/manifest.json`.

FFmpeg is the tool: `ffmpeg -i input.wav -c:a libvorbis -q:a 5 output.ogg`

### 6.3 What it does (tilemaps)

1. Walk `assets-raw/tilemaps/`, find all `.tmx`/`.tsx` files.
2. Convert to JSON via Tiled's `tmx2json` or `tiled-unofficial` lib.
3. Validate layer structure (must have all 7 layers).
4. Validate object types against the entity registry.
5. Write to `assets/tilemaps/`.

### 6.4 Validation gates (build fails if any fail)

- All sprites use only the 32-color palette
- All sprite dimensions match the spec
- All tile references in tilemaps exist in the tileset
- All audio files normalize to within ±1 LUFS of target
- All asset references in `data/seed/*.json` exist in baked output
- Total assets size ≤ 30 MB

### 6.5 CI integration

`yarn assets:bake` is run in CI before `yarn build:ios` and
`yarn build:android`. CI fails the build if validation gates fail.

---

## 7. Hot-reload during development

Piskel can auto-export on save. Configure Piskel to export PNG to
`assets-raw/sprites/<name>.png` on every save.

In dev mode, the app watches `assets-raw/` for changes and re-bakes
the affected atlas on the fly. The game canvas reloads the changed
sprite in place.

(MVP: a manual `yarn assets:bake` then app reload is fine. Hot-reload
is a nice-to-have.)

---

## 8. Source-of-truth file (palette)

The palette is **frozen**. To change a color:

1. Open `assets-raw/palettes/shared_palette.png`.
2. Update the hex label and the swatch.
3. Update `assets/palettes/palette.json` (the bake script regenerates
   this, so just rerun the bake).
4. **Re-bake all sprites** — every sprite must be repainted to use the
   new color.
5. Bump palette version (currently 1).
6. **Coordinate with all in-flight sprite work.** A color change is a
   major coordinated change.

**Anti-pattern:** changing a color in just one sprite. Use the
palette.

---

## 9. Asset counts (estimated MVP)

| Asset type | Count | Total KB |
|---|---|---|
| Hero sprites | 40 | 60 KB |
| Companion sprites | 30 × 4 = 120 | 180 KB |
| Enemy sprites | 12 × 14 = 168 | 250 KB |
| Tile sprites | ~960 | 250 KB |
| UI icons | 80 | 80 KB |
| Item icons | 50 | 50 KB |
| VFX sprites (particles) | 30 | 30 KB |
| Sprite sheets (PNG) | 6 sheets @ 1024² = ~24 KB each | ~150 KB |
| Manifests (JSON) | 6 | ~100 KB |
| **Total sprites** | | **~1.1 MB** |
| Music | 14 tracks @ 1 MB avg | ~14 MB |
| Ambience | 6 tracks @ 0.3 MB | ~2 MB |
| SFX | 60 @ 50 KB | ~3 MB |
| Tilemaps | 50 (MVP) | ~500 KB |
| **Total assets** | | **~21 MB** |

Below budget. ✓

---

## 10. Tooling

- **Piskel** (sprites): free, browser, no signup. https://www.piskelapp.com/
- **Tiled** (tilemaps): free, open source, desktop. https://www.mapeditor.org/
- **Audacity** (audio editing, optional): free, open source.
- **FFmpeg** (audio bake): command-line, install via `brew install ffmpeg` /
  `apt install ffmpeg`.

All four are well-known, free, and work on any platform.

---

## 11. Authoring rules (for build agents generating sprites)

1. **Always use the 32-color palette.** No off-palette colors.
2. **Sprite dimensions are locked** (see [`01-game-design-document.md`](./01-game-design-document.md#visual--art-direction)).
3. **Save the `.piskel` source** alongside the PNG export. Future edits
   need the source.
4. **No anti-aliasing** for pixel art. Piskel has an "off" mode; use it.
5. **All sprites are 16px-aligned** in their final atlas position.
6. **Hero and companions have a 1px black outline** on the silhouette
   (uses the 32-color `#000000` slot).
7. **Enemies have a 1px red outline** when aggressive, gold when neutral.
8. **Tiles are 16×16 with no outlines** (would create visible seams).
