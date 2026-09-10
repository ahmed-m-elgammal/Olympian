# 10 — i18n & RTL

> **Library:** i18next + react-i18next + react-native-localize
> **MVP locales:** English (en), Arabic (ar)
> **Post-MVP:** Spanish (es), German (de)
> **Direction:** LTR for en/es/de, **RTL for ar**

---

## 1. Architecture

```
src/i18n/
├── index.ts                  # i18next init, locale detection
├── locales/
│   ├── en/
│   │   ├── common.json       # shared UI strings
│   │   ├── items.json        # item names/descriptions
│   │   ├── dialogues.json    # full dialogue scripts
│   │   ├── ui.json           # menus, screens, modals
│   │   ├── tutorial.json     # tutorial text
│   │   └── acts.json         # Act names, NPC names, lore
│   ├── ar/                   # mirror structure
│   │   ├── common.json
│   │   ├── items.json
│   │   ├── dialogues.json
│   │   ├── ui.json
│   │   ├── tutorial.json
│   │   └── acts.json
│   ├── es/                   # stub at MVP, full at v1.0
│   │   └── .gitkeep
│   └── de/                   # stub at MVP, full at v1.0
│       └── .gitkeep
├── rtl/
│   ├── applyRTL.ts           # flips I18nManager based on locale
│   └── mirroring.ts          # sprite flip logic
└── helpers/
    ├── pl.ts                 # plural rules per locale
    ├── date.ts               # date formatting
    └── num.ts                # number formatting
```

---

## 2. Locale setup

### 2.1 i18next configuration

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import en_common from './locales/en/common.json';
import en_items from './locales/en/items.json';
// ... other en files
import ar_common from './locales/ar/common.json';
// ... other ar files

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const RTL_LOCALES: SupportedLocale[] = ['ar'];

export const resources = {
  en: {
    common: en_common,
    items: en_items,
    dialogues: en_dialogues,
    ui: en_ui,
    tutorial: en_tutorial,
    acts: en_acts,
  },
  ar: {
    common: ar_common,
    items: ar_items,
    dialogues: ar_dialogues,
    ui: ar_ui,
    tutorial: ar_tutorial,
    acts: ar_acts,
  },
};

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources,
    lng: getInitialLocale(),
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },    // RN handles escaping
    returnNull: false,
    returnEmptyString: false,
  });

function getInitialLocale(): SupportedLocale {
  const deviceLocales = RNLocalize.getLocales();
  for (const dl of deviceLocales) {
    const code = dl.languageCode as SupportedLocale;
    if (SUPPORTED_LOCALES.includes(code)) return code;
  }
  return 'en';
}
```

### 2.2 Locale persistence

The chosen locale is stored in `settings` table (per-save) and
mirrored to MMKV under `active_locale` for fast cold-start.

On every app launch, MMKV is read first; if empty, falls back to
device locale; if device locale is not supported, falls back to 'en'.

---

## 3. String key naming convention

Hierarchical, dot-separated, snake_case for variables.

### 3.1 Format

```
<namespace>.<screen_or_area>.<element>
```

Examples:
- `common.cancel` — shared "Cancel"
- `ui.buttons.continue` — "Continue" button
- `ui.hub.depart` — "Depart" button on hub
- `ui.pause.title` — "Paused" title
- `items.potion_minor.name` — "Minor Potion"
- `items.potion_minor.description` — "Restores 30 HP."
- `dialogues.athena.intro.line_1` — first line of Athena's intro
- `acts.1.name` — "The Nemean Lion"
- `acts.1.description` — Act 1 description
- `companions.athena.name` — "Athena"
- `tutorial.reflex.step_1` — first tutorial step for Reflex mechanic

### 3.2 Interpolation

```json
// en/common.json
{
  "greeting": "Hello, {{name}}!",
  "level_reached": "You reached level {{level}}!",
  "items_collected": "Collected {{count}} item",
  "items_collected_plural": "Collected {{count}} items"
}
```

```typescript
t('greeting', { name: hero.name });     // "Hello, Alexios!"
t('level_reached', { level: 5 });
```

### 3.3 Pluralization

i18next handles plural forms per locale. For Arabic, the 6-form
plural rules (zero, one, two, few, many, other) apply.

```json
// ar/common.json
{
  "items_collected_zero": "لم تجمع أي عنصر",
  "items_collected_one": "تم جمع عنصر واحد",
  "items_collected_two": "تم جمع عنصرين",
  "items_collected_few": "تم جمع {{count}} عناصر",
  "items_collected_many": "تم جمع {{count}} عنصرًا",
  "items_collected_other": "تم جمع {{count}} عنصر"
}
```

Helper:

```typescript
// src/i18n/helpers/pl.ts
export function plural(locale: string, count: number, key: string, params: object) {
  return i18n.t(key, { count, ...params });
}
```

---

## 4. RTL strategy

### 4.1 Activation

```typescript
// src/i18n/rtl/applyRTL.ts
import { I18nManager } from 'react-native';
import { RTL_LOCALES } from '../index';

export function applyRTL(locale: string) {
  const isRTL = RTL_LOCALES.includes(locale as any);
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.forceRTL(isRTL);
    // The next app restart will apply. We don't reload mid-game.
  }
}
```

The locale picker calls `applyRTL` before navigating forward. The user
is told "Restarting to apply changes" and the app re-launches.

### 4.2 Component-level RTL

All components use logical properties:

| Avoid | Use |
|---|---|
| `marginLeft` | `marginStart` |
| `paddingRight` | `paddingEnd` |
| `textAlign: 'right'` | `textAlign: 'end'` |
| `flexDirection: 'row'` with absolute LTR assumption | Rely on RN's auto-flip |
| Icons hardcoded to face one way | Use `applyMirroring` helper |

Reanimated transforms are **logical**: `translateX` in RTL flips
direction with the rest of the layout. This is automatic in RN.

### 4.3 Sprite mirroring

Some sprites are asymmetric (e.g., a character with a sword on the
right side). In RTL, these should mirror so the sword appears on the
visual left. The mirroring is done at the render layer, not the
component layer.

```typescript
// src/i18n/rtl/mirroring.ts
const MIRRORED_SPRITES = new Set([
  'hero_idle', 'hero_walk', 'hero_attack',
  'athena_idle', 'athena_walk',
  'hind_idle', 'hind_walk',
  // ... add per-sprite as needed
]);

export function shouldMirror(spriteId: string): boolean {
  return I18nManager.isRTL && MIRRORED_SPRITES.has(spriteId);
}

// In Skia draw command:
{
  type: 'sprite',
  ...,
  flipX: shouldMirror(sprite.id),     // already false if LTR or symmetric
}
```

### 4.4 What to mirror

| Sprite | Mirror? |
|---|---|
| Character body (symmetric) | No |
| Character body (asymmetric pose) | Yes |
| Sword held on right side | Yes |
| Toga draped over left shoulder | Yes |
| Marble statue (symmetric) | No |
| Bird (facing one way) | Yes |
| Directional UI icons (back arrow, forward arrow) | Yes |
| Symmetric UI icons (gear, heart) | No |

### 4.5 Typography in RTL

- Switch Display font: `Cinzel` → `Amiri` (classical Arabic face)
- Body font: `Inter` continues to work (it has Arabic glyphs)
- Letter spacing: 0 (Arabic doesn't use letter-spacing like Latin)
- Line height: 1.5x (vs 1.4x for Latin) for Arabic — slightly more
  breathing room

```typescript
// src/ui/theme/typography.ts
const displayLg = locale === 'ar'
  ? { fontFamily: 'Amiri', fontWeight: '700', fontSize: 36, lineHeight: 54 }
  : { fontFamily: 'Cinzel', fontWeight: '700', fontSize: 32, lineHeight: 40 };
```

### 4.6 Numbers

**Decision: Western digits (0-9) for all locales, including Arabic.**

Rationale: Game numbers (HP, gold, levels) read cleaner in Western
digits, and screenshots shared between players are readable. This is
common in Arabic mobile games (Candy Crush, Clash of Clans).

If users complain, switching to Eastern Arabic digits is a single
config change.

---

## 5. String table guidelines (for translators)

When writing a new English string, follow these rules:

1. **Use full sentences** where space allows. UI strings often need to
   be ≤30 chars (mobile buttons); prefix the key with `ui.short.` for
   abbreviated variants.
2. **Avoid idioms.** Translate literally into Arabic, not creatively.
3. **No concatenation.** Use interpolation: `t('hello', { name })`,
   not `t('hello') + name`.
4. **No HTML.** All text is plain (RTL/formatting is automatic).
5. **Plurals for any count.** Use i18next plural, not "1 item" / "n items"
   branching in code.

### 5.1 String table sample

```json
// en/ui.json
{
  "buttons": {
    "continue": "Continue",
    "back": "Back",
    "settings": "Settings",
    "save": "Save",
    "delete": "Delete",
    "confirm": "Confirm",
    "cancel": "Cancel"
  },
  "hub": {
    "depart": "Depart",
    "temple": "Temple",
    "party": "Party",
    "relics": "Relic Wall",
    "settings": "Settings",
    "save_and_quit": "Save and Quit"
  },
  "pause": {
    "title": "Paused",
    "resume": "Resume",
    "save_and_quit": "Save and Quit to Title"
  },
  "errors": {
    "save_corrupted": "Your save file appears damaged. Starting fresh in this slot.",
    "iap_failed": "Purchase failed. Please try again.",
    "asset_missing": "An update is required. Please visit the store."
  }
}
```

```json
// ar/ui.json
{
  "buttons": {
    "continue": "متابعة",
    "back": "رجوع",
    "settings": "الإعدادات",
    "save": "حفظ",
    "delete": "حذف",
    "confirm": "تأكيد",
    "cancel": "إلغاء"
  },
  "hub": {
    "depart": "انطلق",
    "temple": "المعبد",
    "party": "الحلفاء",
    "relics": "جدار الآثار",
    "settings": "الإعدادات",
    "save_and_quit": "حفظ والخروج"
  },
  "pause": {
    "title": "متوقف",
    "resume": "استئناف",
    "save_and_quit": "حفظ والخروج للقائمة"
  },
  "errors": {
    "save_corrupted": "يبدو ملف الحفظ تالفًا. سيتم البدء من جديد في هذه الفتحة.",
    "iap_failed": "فشلت عملية الشراء. حاول مجددًا.",
    "asset_missing": "التحديث مطلوب. يرجى زيارة المتجر."
  }
}
```

---

## 6. Translation workflow

For MVP:
- English source is the canonical string table.
- Arabic translations are done by a professional translator (paid
  service, not MT).
- Translations live in `src/i18n/locales/<lang>/<namespace>.json`.

Adding a new language (es, de) at v1.0:
1. Add a folder `src/i18n/locales/<lang>/` with empty `*.json` files
   (only the keys, no values) to identify missing translations.
2. The app falls back to `en` for any missing key.
3. A "translation coverage" report can be generated with
   `scripts/i18n-coverage.ts`.

---

## 7. Date and number formatting

```typescript
// src/i18n/helpers/date.ts
import * as RNLocalize from 'react-native-localize';

export function formatDate(epoch: number): string {
  const locale = i18n.language;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(epoch));
}

export function formatRelativeTime(epoch: number): string {
  // e.g. "2 hours ago" / "منذ ساعتين"
  // Use Intl.RelativeTimeFormat with the locale
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
  const diffMs = epoch - Date.now();
  const diffHours = Math.round(diffMs / 3600000);
  return rtf.format(diffHours, 'hour');
}
```

`Intl` is polyfilled by Hermes (RN's JS engine) on iOS/Android in
RN 0.76+. No manual polyfill needed.

---

## 8. Voice & tone

The game has a specific voice. Translators should match it.

- **English:** direct, slightly archaic, with a hint of mythic grandeur.
  - Example: "The Hydra rises. Strike its heart, lest its heads
    multiply."
- **Arabic:** formal/classical register (Modern Standard Arabic, not
  colloquial). Mythic, weighty.
  - Translation should not sound "casual mobile game."

A small style guide is shipped at `docs/translation-style-guide.md`
(deferred, will be authored before Arabic translation begins).

---

## 9. Performance

- i18next is loaded once at app start. No runtime loading of namespaces.
- All translation JSONs are bundled (not lazy-loaded) at MVP. Total
  size: ~150 KB across 6 namespaces × 2 locales. Acceptable.
- For v1.0+ (more locales), consider namespace lazy-loading by screen
  to reduce initial bundle.

---

## 10. Testing

Each locale has a paired coverage test:
- `i18n.en.test.ts` — checks every key in source is present in `en/`
- `i18n.ar.test.ts` — checks every key in `en/` is also in `ar/` (no
  missing translations)
- `i18n.values.test.ts` — runs placeholder interpolation against sample
  params, ensures no `{{undefined}}` strings leak

```typescript
// src/i18n/__tests__/i18n.ar.test.ts
import ar_resources from '../locales/ar/';
import en_resources from '../locales/en/';

it('Arabic has all English keys', () => {
  for (const ns of Object.keys(en_resources)) {
    for (const key of Object.keys(en_resources[ns])) {
      expect(ar_resources[ns]).toHaveProperty(key);
    }
  }
});
```

This runs in CI and blocks release if any Arabic key is missing.
