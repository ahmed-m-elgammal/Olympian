# 06 — Screen Flows & Navigation

> **Navigator:** React Navigation v7 (native-stack)
> **Pattern:** Native stack per "phase" (boot, auth-less, gameplay)
> **Deep links:** Reserved (not used at MVP, but routes are deep-linkable)

---

## 1. Navigator tree

```
RootNavigator (NativeStack)
├── BootGate (decides which branch based on save state)
│
├── OnboardingStack (only shown if no saves exist OR first launch)
│   ├── LanguagePickerScreen
│   ├── TitleScreen
│   └── IntroCinematicScreen
│
├── SaveSelectStack (shown if saves exist OR after onboarding)
│   ├── SaveSelectScreen
│   └── (modal) NewGameScreen
│
└── MainStack (after a save is loaded — the in-game root)
    ├── HubScreen                       (default)
    ├── OverworldScreen                 (when in an Act)
    ├── LevelScreen                     (in a puzzle room)
    ├── BossScreen                      (in a boss room)
    ├── DialogueScreen                  (modal, full-screen)
    │
    ├── (modal) PauseModal
    ├── (modal) SettingsModal
    ├── (modal) InventoryModal
    ├── (modal) PartyModal
    ├── (modal) RelicWallModal
    ├── (modal) LevelClearModal
    ├── (modal) LevelFailModal
    ├── (modal) BossDefeatedModal
    ├── (modal) CompanionJoinModal
    ├── (modal) SaveModal
    ├── (modal) PaywallModal            (deferred monetization)
    ├── (modal) ConfirmModal            (generic yes/no)
    └── (modal) ToastHost               (always-on, transparent screen)
```

### 1.1 Why this shape

- **Native stack** is the fastest RN navigator and handles back gesture
  (Android) / swipe-back (iOS) correctly.
- **Modals** are presented modally so the back gesture dismisses them
  before popping the underlying screen.
- **ToastHost** is a transparent always-mounted screen so toasts can
  appear over any other screen.

### 1.2 Navigation type

```typescript
// src/app/navigation/types.ts
export type RootStackParamList = {
  BootGate: undefined;
  OnboardingStack: NavigatorScreenParams<OnboardingStackParamList>;
  SaveSelectStack: NavigatorScreenParams<SaveSelectStackParamList>;
  MainStack: NavigatorScreenParams<MainStackParamList>;
};

export type OnboardingStackParamList = {
  LanguagePicker: undefined;
  Title: undefined;
  IntroCinematic: undefined;
};

export type SaveSelectStackParamList = {
  SaveSelect: undefined;
  NewGame: undefined;
};

export type MainStackParamList = {
  Hub: undefined;
  Overworld: { act: number };
  Level: { levelId: string };
  Boss: { bossId: string; act: number };
  Dialogue: { dialogueId: string; lineIndex?: number };
  Pause: undefined;
  Settings: undefined;
  Inventory: undefined;
  Party: undefined;
  RelicWall: undefined;
  LevelClear: { levelId: string; stars: number; rewards: Reward[] };
  LevelFail: { levelId: string; attempts: number };
  BossDefeated: { bossId: string; rewards: Reward[] };
  CompanionJoin: { companionId: string };
  SaveModal: undefined;
  Paywall: { source: PaywallSource };
  Confirm: {
    titleKey: string;
    messageKey: string;
    confirmKey: string;
    cancelKey?: string;
    onConfirm: () => void;
  };
};
```

---

## 2. Screen-by-screen spec

For each screen: **purpose**, **entry data**, **UI composition**, **exit transitions**, **side effects**.

### 2.1 `LanguagePickerScreen`

- **Purpose:** First launch only. Pick EN or AR.
- **Entry data:** none.
- **UI:** Two large flag-style buttons (Cinzel "English" / "العربية"),
  a `Continue` button (disabled until selection).
- **Exit:** Push `Title`.
- **Side effect:** Sets `settings.language` and applies RTL if Arabic.

### 2.2 `TitleScreen`

- **Purpose:** Splash-style title with menu.
- **Entry data:** none.
- **UI:** Animated logo (Skia), "New Game" / "Continue" / "Settings" buttons.
- **Exit:** → `NewGame`, `SaveSelect`, or `Settings`.

### 2.3 `IntroCinematicScreen`

- **Purpose:** 60s narrative intro (pillar cracking, hero summoned).
- **Entry data:** hero name (from `NewGame`).
- **UI:** Full-screen Skia animation with text overlays and a "Skip"
  button.
- **Exit:** Push `Hub` (Act 1 hub).
- **Side effect:** Creates the save slot, populates starting inventory.

### 2.4 `SaveSelectScreen`

- **Purpose:** List existing saves; resume or delete.
- **Entry data:** list of saves from DB.
- **UI:** 3-slot list, each shows hero name, level, current Act, playtime.
  Per-slot: "Continue" / "Delete" actions.
- **Exit:** → `Hub` (with chosen save loaded) or `NewGame`.

### 2.5 `NewGameScreen`

- **Purpose:** Create a new save slot. Pick hero name.
- **Entry data:** target slot.
- **UI:** Slot picker (if multiple empty) → name input → "Begin".
- **Exit:** → `IntroCinematic`.
- **Side effect:** Creates `saves` row + initial `hero_stats` + `settings`.

### 2.6 `HubScreen` (the home base for an Act)

- **Purpose:** The town/hub between Act content. Save, swap party, shop
  (no shops at MVP), view relics, depart.
- **Entry data:** current act, save state.
- **UI:**
  ```
  ┌─────────────────────────────────┐
  │  [Top bar: hero name + level]    │
  │                                   │
  │  ┌─────────┐  ┌─────────┐        │
  │  │ Temple   │  │ Party    │        │
  │  │ (story)  │  │ (swap)   │        │
  │  └─────────┘  └─────────┘        │
  │  ┌─────────┐  ┌─────────┐        │
  │  │ Relics   │  │ Settings │        │
  │  └─────────┘  └─────────┘        │
  │                                   │
  │  [Big button: Depart to Act]     │
  └─────────────────────────────────┘
  ```
- **Exit:** → `Overworld`, `Party`, `Settings`, etc.

### 2.7 `OverworldScreen`

- **Purpose:** Top-down tile map of the current Act.
- **Entry data:** `act: number`.
- **UI:** Skia canvas, joystick, character sprite, markers.
- **Exit:** → `Level` (tap marker), `Boss` (tap boss marker), `Hub`
  (return portal).

### 2.8 `LevelScreen`

- **Purpose:** Single puzzle room.
- **Entry data:** `levelId: string`.
- **UI:** Skia canvas, puzzle-specific UI, in-game HUD.
- **Exit:** → `LevelClear` (on solve) / `LevelFail` (on 3-fail) / `Overworld`
  (on exit-back).

### 2.9 `BossScreen`

- **Purpose:** Combat + puzzle fusion encounter.
- **Entry data:** `bossId`, `act`.
- **UI:** Combat UI + puzzle overlay during phase 2.
- **Exit:** → `BossDefeated` / `LevelFail` / `Overworld`.

### 2.10 `DialogueScreen`

- **Purpose:** Full-screen narrative dialogue (cinematic moments only).
- **Entry data:** `dialogueId`, optional `lineIndex`.
- **UI:** Background art, character portrait, scrolling text box.
- **Exit:** Pops to caller (Hub / Overworld).

### 2.11 `PauseModal`

- **Purpose:** Pause menu shown from in-game.
- **UI:** Resume / Settings / Save / Quit to Hub.
- **Side effect:** Pauses game loop.

### 2.12 `SettingsModal`

- **Purpose:** All settings (audio, language, accessibility, etc.).
- **UI:** Tabbed list (Audio / Language / Display / Controls / About).
- **Side effect:** Writes through `settingsStore` → SQLite + MMKV.

### 2.13 `InventoryModal`

- **Purpose:** Browse inventory, equip items, use consumables.
- **UI:** Grid (32 slots) + detail panel + Equip/Use/Drop buttons.
- **Side effect:** Writes through `inventoryStore`.

### 2.14 `PartyModal`

- **Purpose:** Manage active party (hero + 2 companions), swap bench.
- **UI:** Active slots (3) + bench list + companion details.
- **Side effect:** Writes through `partyStore`.

### 2.15 `RelicWallModal`

- **Purpose:** View collected relics (per Act).
- **UI:** Wall layout, 12 relic slots, animated reveal on tap.

### 2.16 `LevelClearModal`

- **Purpose:** Rewards + stars + next level.
- **UI:** Star display, reward list, "Continue" / "Replay" / "Quit".
- **Side effect:** Persists `progress` row.

### 2.17 `LevelFailModal`

- **Purpose:** Out of attempts. Show "Use a gem to skip" or "Retry".
- **UI:** Sad sprite, attempt count, options.

### 2.18 `BossDefeatedModal`

- **Purpose:** Big celebratory screen on boss kill.
- **UI:** Skia VFX, boss death animation, reward showcase, "Continue".

### 2.19 `CompanionJoinModal`

- **Purpose:** When a companion joins, show their intro.
- **UI:** Portrait + signature ability + "Welcome to the party".

### 2.20 `SaveModal`

- **Purpose:** Manual save confirmation.
- **UI:** "Game saved." + timestamp + "OK".

### 2.21 `PaywallModal` (deferred)

- **Purpose:** Stubbed for now. Shown only if `OLYMPIAN_PAYWALL_ENABLED=true`.
- **UI:** One IAP product, "Restore Purchases" button, dismiss.
- **Side effect:** On purchase, sets `iap_owned` in MMKV.
- **See:** [`13-paywall-and-iap.md`](./13-paywall-and-iap.md)

### 2.22 `ConfirmModal`

- **Purpose:** Generic yes/no (quit, delete save, etc.).
- **UI:** Title + message + 2 buttons.

---

## 3. Boot flow

```
App.tsx mounts
  ↓
BootGate (splash visible)
  ↓
Check: any saves exist? (db query, sync, <50ms)
  ├─ No  → OnboardingStack
  └─ Yes → SaveSelectStack
```

After save select / new game completion, the navigator switches to
`MainStack` with `Hub` as the initial screen. This is a one-time
stack swap (we don't unmount `BootGate` until first choice is made).

### 3.1 `BootGate` UI

A full-screen Skia animation (Athena's owl sigil) that displays during
the ~200ms initialization. Disappears as soon as the right stack is
chosen.

---

## 4. Back button / gesture rules

| Surface | Back behavior |
|---|---|
| `Hub` | Minimize app (don't pop) |
| `Overworld` | → `Hub` |
| `Level` | → `Overworld` (with confirm if mid-puzzle) |
| `Boss` | → `Overworld` (with confirm if mid-fight) |
| Any modal | Dismiss modal first |
| `Dialogue` | Advance line; only on last line does it pop |
| `LanguagePicker` | (none, this is the root) |
| `Title` | Minimize app |
| `SaveSelect` | → `Title` |

The Android hardware back button maps 1:1 to the above.

---

## 5. Transitions

- **Default:** native-stack default (slide from end in LTR, from start in RTL).
- **Modal:** slide up from bottom (LTR) / bottom (RTL — same direction).
- **Boot → main:** fade.
- **Cinematic → Hub:** fade through black.

All transitions respect `reduceMotion`: when true, transitions become
instant (or 100ms cross-fade).

---

## 6. Deep links (reserved)

Route names are deep-linkable so future marketing (web → app) works.
For MVP, **no deep links are configured** at the OS level. Routes
support a `path` property in `linking` config but it's unused.

```typescript
// Future — do not implement at MVP
const linking = {
  prefixes: ['olympian://'],
  config: {
    screens: {
      MainStack: {
        screens: {
          Level: { path: 'level/:levelId' },
          Boss: { path: 'boss/:bossId' },
        },
      },
    },
  },
};
```

---

## 7. State preservation across navigation

- **Persistent stores** (player, party, inventory, progress, settings)
  retain state across all navigations. They only change on save actions.
- **Session store** retains state during navigation within MainStack but
  resets when leaving to Boot/SaveSelect.
- **Game loop** is paused when not in a Level/Boss/Overworld screen.
  This is enforced by a hook: `useGameLoopController(active: boolean)`.
- **Audio** cross-fades between tracks based on screen transitions.

---

## 8. i18n integration

All visible strings are i18n keys:

```typescript
<Button>{t('hub.depart')}</Button>
```

No English text in components. See [`10-i18n-and-rtl.md`](./10-i18n-and-rtl.md).

---

## 9. Error screens

Three error screens, all reachable from BootGate if init fails:

- `DbInitErrorScreen` — DB failed to open. "Reinstall required."
- `AssetLoadErrorScreen` — Bundled assets missing. "Update required."
- `GenericErrorScreen` — Catch-all. "Something went wrong." + reload button.

Errors are logged via `@/shared/log` and persisted to a `crash.log` file
in app documents (so the user can email it to support if needed —
no crash reporting SDK in MVP).

---

## 10. Performance rules

- **Lazy-load modals** — use `React.lazy` for InventoryModal, PartyModal,
  SettingsModal. They're heavy and rare.
- **Image preload** — preload all sprite atlases in BootGate.
- **Skia reuse** — `GameCanvas` is mounted once at the root of MainStack
  and its scene changes by mutation, not remount.
- **No navigation transitions block the main thread** — native-stack uses
  native screen containers.
