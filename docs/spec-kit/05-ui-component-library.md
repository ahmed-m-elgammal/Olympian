# 05 — UI Component Library

> **Framework:** React Native 0.76 + Reanimated 3
> **Location:** `src/ui/`
> **Theming:** Design tokens (locked values, no inline values)
> **RTL:** First-class — every component RTL-aware

---

## 1. Design principles

1. **Tokens, not values.** No hardcoded colors, sizes, or fonts. Every
   visual property comes from `src/ui/theme/tokens.ts`.
2. **RTL by default.** Every layout uses `start`/`end`, never `left`/`right`.
3. **Touch targets ≥ 44pt.** Even for game UI.
4. **No emoji.** All icons are sprite-atlas-based.
5. **Type-safe props.** Every component exports its prop type.

---

## 2. Design tokens (`src/ui/theme/`)

### 2.1 Spacing scale

```typescript
// src/ui/theme/spacing.ts
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export type SpacingKey = keyof typeof spacing;
```

All margin/padding/gap must reference `spacing.*`. **No raw numbers.**

### 2.2 Colors (`src/ui/theme/colors.ts`)

```typescript
export const colors = {
  // Base palette — 32 colors shared with sprites
  // See 12-asset-pipeline.md#shared-palette for hex values
  bg0: '#0e0a1f',       // deepest void
  bg1: '#1a1230',       // base background
  bg2: '#2a1f4a',       // card background
  surface: '#3a2d5e',    // raised surface
  border: '#5a4a7e',     // dividers
  text: '#f4ecd8',       // primary text (ivory)
  textMuted: '#a89cc8',  // secondary text
  textDisabled: '#6a6080',
  primary: '#e8b34a',    // gold (godly)
  primaryDark: '#a87a1f',
  secondary: '#8b4a8c',  // purple (divine)
  success: '#5cc472',
  warning: '#e8a23a',
  danger: '#d04848',
  info: '#4a8cd0',

  // Semantic
  hp: '#d04848',
  mp: '#4a8cd0',
  xp: '#5cc472',

  // Translucent overlays
  overlay50: 'rgba(0,0,0,0.5)',
  overlay70: 'rgba(0,0,0,0.7)',
  highlight10: 'rgba(244,236,216,0.1)',
} as const;
```

**Critical:** colors here must match the 32-color palette in
[`12-asset-pipeline.md`](./12-asset-pipeline.md#shared-palette). Adding
or changing a color is a coordinated change in both files.

### 2.3 Typography (`src/ui/theme/typography.ts`)

Two font families:

- **Display** — `Cinzel` (decorative, headings, in-game scrolls).
  TTF in `assets/fonts/Cinzel-Regular.ttf`, `Cinzel-Bold.ttf`.
- **Body** — `Inter` (UI text). Supports Latin, Arabic, Hebrew.
  Variable font, single TTF: `Inter-Variable.ttf`.

For Arabic: switch Display to `Amiri` (a classical Arabic display face)
and Body stays `Inter` (which has Arabic glyphs).

```typescript
export const typography = {
  // Display
  displayLg: {
    fontFamily: 'Cinzel',
    fontWeight: '700' as const,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: 0.5,
  },
  displayMd: {
    fontFamily: 'Cinzel',
    fontWeight: '700' as const,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0.3,
  },
  displaySm: {
    fontFamily: 'Cinzel',
    fontWeight: '400' as const,
    fontSize: 18,
    lineHeight: 24,
  },

  // Body
  bodyLg: {
    fontFamily: 'Inter',
    fontWeight: '400' as const,
    fontSize: 18,
    lineHeight: 26,
  },
  bodyMd: {
    fontFamily: 'Inter',
    fontWeight: '400' as const,
    fontSize: 14,
    lineHeight: 20,
  },
  bodySm: {
    fontFamily: 'Inter',
    fontWeight: '400' as const,
    fontSize: 12,
    lineHeight: 16,
  },

  // Numeric (game stats)
  numeric: {
    fontFamily: 'Inter',
    fontWeight: '700' as const,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;
```

**Text scale:** `bodyLg * textScale` (user setting). All body text scales;
display text scales at 0.5× the user's scale to avoid overflow.

### 2.4 Sizing (`src/ui/theme/sizing.ts`)

```typescript
export const sizing = {
  touchTargetMin: 44,         // iOS HIG
  buttonHeightSm: 32,
  buttonHeightMd: 44,
  buttonHeightLg: 56,
  inputHeight: 44,
  iconXs: 12,
  iconSm: 16,
  iconMd: 24,
  iconLg: 32,
  iconXl: 48,
  borderRadiusSm: 4,
  borderRadiusMd: 8,
  borderRadiusLg: 16,
  borderWidth: 1,
  borderWidthFocus: 2,
  hairline: 0.5,
} as const;
```

### 2.5 Elevation (`src/ui/theme/elevation.ts`)

```typescript
export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: { shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  md: { shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  lg: { shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;
```

### 2.6 Z-index scale

```typescript
export const z = {
  base: 0,
  raised: 10,
  sticky: 100,
  overlay: 1000,
  modal: 2000,
  toast: 3000,
  devtools: 9999,
} as const;
```

### 2.7 Animation tokens

```typescript
export const motion = {
  fast: 150,       // ms — taps, hovers
  base: 250,       // ms — most transitions
  slow: 400,       // ms — page transitions, modals
  spring: {
    damping: 18,
    stiffness: 180,
    mass: 1,
  },
  // Easing curves
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    in: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
} as const;
```

`reduceMotion=true` → all durations become 0; springs become linear.

---

## 3. Primitives (`src/ui/primitives/`)

### 3.1 `<View>`

Thin wrapper over `react-native` `View` that:
- Applies `start`/`end`-aware padding/margin
- Forwards ref to inner `View`
- Accepts `bg`, `p`, `m`, `gap`, `rounded` props (token keys)

```typescript
interface ViewProps {
  bg?: ColorKey;
  p?: SpacingKey;
  px?: SpacingKey;
  py?: SpacingKey;
  pt?: SpacingKey;
  pr?: SpacingKey;
  pb?: SpacingKey;
  pl?: SpacingKey;
  m?: SpacingKey;
  mx?: SpacingKey;
  my?: SpacingKey;
  mt?: SpacingKey;
  mr?: SpacingKey;
  mb?: SpacingKey;
  ml?: SpacingKey;
  gap?: SpacingKey;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  bordered?: boolean;
  elevated?: 'none' | 'sm' | 'md' | 'lg';
  // ... plus all standard RN View props
}
```

### 3.2 `<Text>`

```typescript
interface TextProps {
  variant?: keyof typeof typography;
  color?: ColorKey;
  align?: 'start' | 'center' | 'end';
  numberOfLines?: number;
  selectable?: boolean;
  // ...
}
```

Auto-applies `allowFontScaling` based on user `textScale` setting.

### 3.3 `<Button>`

Three variants: `primary` (gold), `secondary` (purple), `ghost` (transparent).
Three sizes: `sm`, `md`, `lg`.

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  iconStart?: SpriteIconKey;
  iconEnd?: SpriteIconKey;
  hapticOnPress?: 'light' | 'medium' | 'heavy' | 'none';
  onPress: () => void;
  children: ReactNode;
}
```

**Behavior:**
- Press triggers haptic (configurable)
- Loading shows a Skia spinner over label
- Disabled reduces opacity to 0.4 and blocks press
- Press animation: scale 0.97 for 100ms (Reanimated)

### 3.4 `<Icon>`

```typescript
interface IconProps {
  name: SpriteIconKey;        // e.g. 'sword' | 'shield' | 'potion_red'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: ColorKey;           // optional tint
}
```

Icons come from a single 64×64 sprite sheet (`assets/sprites/atlas_ui_64.png`)
with a corresponding JSON manifest. Renders via Skia `<Image>`.

### 3.5 `<Input>`

```typescript
interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholderKey?: string;    // i18n key
  maxLength?: number;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'words';
  // ...
}
```

For the hero name entry: `maxLength=8`, `autoCapitalize=words`, accepts
Latin and Arabic characters.

### 3.6 `<Modal>`

A wrapping component over RN's `Modal` that:
- Auto-handles backdrop press
- Slides up from bottom in LTR/RTL mode
- Closes on back button (Android) / swipe-down (iOS)
- Renders inside a `<Portal>` to escape local overflow:hidden

### 3.7 `<ProgressBar>`

```typescript
interface ProgressBarProps {
  value: number;              // 0..1
  variant?: 'hp' | 'mp' | 'xp' | 'generic';
  showLabel?: boolean;
  // ...
}
```

Animated via Reanimated `useSharedValue` + `withTiming`.

### 3.8 `<DialogueBox>`

Special in-game component for NPC dialogue. Renders:
- A scroll-framed text box at the bottom
- A speaker name label (top-left, scroll-end in RTL)
- A "next" indicator (bottom-end, animated)
- Typewriter effect on text reveal

```typescript
interface DialogueBoxProps {
  speakerNameKey: string;
  textKey: string;            // i18n key
  onAdvance: () => void;
  typewriterSpeed?: number;   // chars/sec, default 40
  isLastLine?: boolean;
}
```

---

## 4. Composed components (`src/ui/composed/`)

### 4.1 `<Card>`

```typescript
interface CardProps {
  titleKey?: string;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: SpacingKey;
  onPress?: () => void;        // makes the card tappable
}
```

### 4.2 `<ListItem>`

For inventory rows, settings rows, save slot rows.

```typescript
interface ListItemProps {
  iconStart?: SpriteIconKey;
  titleKey: string;
  subtitleKey?: string;
  trailingText?: string;       // e.g. "×5" for stack count
  onPress?: () => void;
  disabled?: boolean;
}
```

### 4.3 `<TabBar>`

Bottom tab bar for hub navigation.

```typescript
interface TabBarProps {
  tabs: Array<{
    iconKey: SpriteIconKey;
    labelKey: string;
    badge?: number;
  }>;
  activeIndex: number;
  onChange: (index: number) => void;
}
```

### 4.4 `<ActionBar>`

Stack of action buttons shown in modal/dialog contexts (e.g., level
clear dialog: "Continue", "Restart", "Quit to Hub").

### 4.5 `<Toast>`

Brief feedback messages (item acquired, level up, etc.).

```typescript
interface ToastProps {
  messageKey: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;          // ms, default 2000
}
```

Toasts queue. The toast manager auto-dismisses after duration or on
user tap.

### 4.6 `<StatBar>`

Hero/companion stat display: avatar + name + HP bar + level.

### 4.7 `<ItemIcon>`

Wrapper around `<Icon>` that:
- Renders a 64×64 item sprite
- Shows stack count in bottom-right if qty > 1
- Shows a small rarity gem in top-left (color-coded)

### 4.8 `<PortraitFrame>`

Marble-frame avatar for heroes/companions/bosses. Renders the
character's idle sprite inside a decorative Skia border.

### 4.9 `<StarDisplay>`

Shows 0–3 stars, animated fill on award.

---

## 5. In-game UI (`src/game/ui/`)

These render as **Skia overlays** during gameplay, not as React Native
components (for perf). They hook into the game canvas.

### 5.1 `HUD`

Top-left: HP/MP/XP bars. Top-right: minimap (small). Bottom-left:
joystick. Bottom-right: action buttons (attack, special, item, pause).

### 5.2 `DialogueOverlay`

Reuses `<DialogueBox>` (rendered as Skia text) when in-game.

### 5.3 `PuzzleHUD`

Contextual per-mechanic UI:
- **Reflex:** timer bar, hearts remaining
- **Sequence:** step indicator ("3 of 5")
- **Path:** move counter
- **Timing:** score meter
- **Logic:** hint button
- **Maze:** map fragment indicator

### 5.4 `CombatUI`

Bottom: action menu (Attack / Skill / Item / Defend / Flee).
Right: turn order indicator.
Top: enemy HP bars.

---

## 6. Iconography

### 6.1 Icon sprite sheet

**Single file:** `assets/sprites/atlas_ui_64.png`
- Resolution: 1024×1024 (16×16 grid of 64×64 icons)
- All icons on transparent background
- Shared palette (32 colors)
- Authored in Piskel, exported as PNG
- **Manifest:** `assets/sprites/atlas_ui_64.json` (TexturePacker format)

### 6.2 Icon catalog (initial set, ~80 icons)

UI: `close`, `check`, `chevron_start`, `chevron_end`, `chevron_up`, `chevron_down`,
`plus`, `minus`, `search`, `settings`, `pause`, `play`, `sound_on`, `sound_off`,
`music_on`, `music_off`, `language`, `back`, `info`, `warning`, `error`,
`star_filled`, `star_empty`, `heart`, `potion_red`, `potion_blue`, `potion_green`,
`gold_coin`, `gem`, `key`, `chest`, `scroll`, `sword`, `shield`, `bow`, `staff`,
`helm`, `body_armor`, `ring`, `trinket`, `relic`, `attack`, `defend`, `magic`,
`flee`, `item_use`, `special`, `lightning`, `fire`, `ice`, `poison`, `holy`,
`shadow`, `light`, `lock`, `unlock`, `compass`, `map`, `boot`, `wing`, `eye`,
`hand`, `skull`, `dragon`, `wolf`, `bird`, `snake`, `spider`, `minotaur`,
`hydra`, `lion`, `boar`, `bull`, `horse`, `stag`, `hare`, `moth`, `bee`,
`ant`, `crab`, `octopus`, `fish`, `humanoid`.

### 6.3 Adding new icons

Append to the Piskel source, re-export, re-bake. The sprite sheet regenerates.
Never hand-edit the PNG.

---

## 7. RTL behavior

### 7.1 Activation

`I18nManager.forceRTL(true)` is called at app start if the user's
selected locale is RTL (currently only `ar`). This flips the entire
RN layout direction.

### 7.2 Components

Every layout-aware component uses logical properties:
- `marginStart` (not `marginLeft`)
- `paddingEnd` (not `paddingRight`)
- `flexDirection: 'row'` — items arrange start→end correctly
- Icons in lists mirror automatically via `I18nManager.isRTL`

### 7.3 Sprite mirroring

Most sprites are symmetric and don't need mirroring. For asymmetric
sprites (e.g., a character holding a sword on the right side), the
rendering layer applies a `scaleX = isRTL ? -1 : 1` transform. This
is **not** done at the component level — it's a render-layer concern
(see [`07-game-engine-and-rendering.md`](./07-game-engine-and-rendering.md)).

### 7.4 Typography

For Arabic, the `Text` component switches to `Amiri` for display text
and uses `Inter`'s Arabic glyphs for body text. The line height and
letter spacing are adjusted via a locale-aware override.

### 7.5 Numbers

In Arabic locale, Western digits are used (`0–9`), not Eastern Arabic
digits (`٠–٩`). This is a deliberate choice — game numbers read cleaner
in Western digits and players across locales can read each other's
screenshots.

---

## 8. Accessibility

| Feature | Implementation |
|---|---|
| Screen reader | All primitives set `accessibilityLabel` from i18n key |
| Dynamic type | `textScale` setting multiplies body font sizes |
| Reduce motion | `motion` tokens become 0/linear |
| High contrast | (Deferred — color tokens have a `highContrast` variant planned) |
| Color blind | Color tokens re-mapped per `colorBlindMode` setting |
| One-handed | Settings flag shifts UI bounds to bottom half |
| Left-handed | Mirrors joystick + action button positions |
| Audio cues | SFX-only puzzles (Logic, Maze) gain audio cues when enabled |

### 8.1 Accessibility props

Every interactive component has:
- `accessibilityLabel` (i18n key resolved)
- `accessibilityRole` ('button' | 'link' | 'adjustable' | etc.)
- `accessibilityState` (disabled, selected, busy, etc.)
- `accessibilityHint` (optional, i18n key)

---

## 9. Storybook (optional but recommended)

For component development in isolation, set up Storybook RN:

```bash
npx storybook init
```

Each primitive gets a `.stories.tsx` file in `src/ui/primitives/__stories__/`.

This is **optional** for MVP but speeds up parallel work.

---

## 10. Performance rules

1. **Avoid `<View>` re-renders.** Use selectors (see state mgmt).
2. **Use `React.memo` for static list items.**
3. **No inline styles.** Always use the token system.
4. **Reanimated for all animations.** Never Animated API.
5. **Skia for in-canvas UI.** RN components over the canvas drop fps.
6. **`FlatList` for long lists.** `inventory`, `settings`, `level select`.
7. **Image priority:** `FastImage priority='high'` for above-fold images.

---

## 11. Anti-patterns

1. **No hardcoded colors, sizes, or fonts in components.** Tokens only.
2. **No `left`/`right` in styles.** Use `start`/`end`.
3. **No emoji in components.** Icons only.
4. **No inline `padding: 13`.** Use `p: 'md'`.
5. **No raw `<View>` from RN in feature code.** Use the wrapper.
6. **No `console.log` in components.** Use the logger (`@/shared/log`).
