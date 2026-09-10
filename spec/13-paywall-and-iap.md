# 13 — Paywall & IAP

> **Status:** Built and integrated, but **not advertised** in MVP.
> **Library:** `react-native-iap`
> **Deferred:** all product pricing, marketing copy, A/B testing.
> **MVP behavior:** Paywall screen exists; products are stubbed; the
> paywall is reachable only via a hidden debug menu (triple-tap on
> settings icon, or `OLYMPIAN_PAYWALL_ENABLED=true` env var).

---

## 1. Why this exists at MVP

- Architecture must support IAP at zero refactor cost.
- Validating the IAP integration end-to-end (purchase flow, receipt
  validation, restore purchases) early catches store-side issues.
- The user said: "everything is local except the paywalls" — so the
  paywall IS implemented; the product catalog and pricing are deferred
  pending playtest data.

---

## 2. The single rule

**No player in the MVP build can find the paywall without dev help.**

This is enforced by:
1. The paywall button is hidden in the UI by default.
2. A `OLYMPIAN_PAYWALL_ENABLED` env flag (default `false`) gates all
   paywall UI.
3. In dev mode, a triple-tap on the Settings icon opens the paywall.
4. In production, the env flag is set to `false` and the paywall is
   inaccessible.

After playtest, we flip the flag, populate product IDs, and ship.

---

## 3. Product catalog (placeholder)

For MVP, the catalog is hardcoded with placeholder IDs:

```typescript
// src/data/seed/iap_products.json
{
  "version": 1,
  "products": [
    {
      "id": "olympian_premium_unlock",
      "type": "non_consumable",
      "tier": "premium",
      "defaultPriceUSD": 4.99,
      "reward": "iap_owned_premium",
      "platforms": {
        "ios": "olympian.premium.unlock",
        "android": "olympian_premium_unlock"
      }
    },
    {
      "id": "olympian_cosmetics_pack_01",
      "type": "non_consumable",
      "tier": "cosmetic",
      "defaultPriceUSD": 1.99,
      "reward": "iap_owned_cosmetics_01",
      "platforms": {
        "ios": "olympian.cosmetics.01",
        "android": "olympian_cosmetics_01"
      }
    }
  ]
}
```

The **reward strings** are what get stored in MMKV on purchase. The app
code checks for these flags to grant in-game content. The **product
IDs** map to App Store Connect / Google Play Console.

The placeholder values are real-looking so the integration tests work.
At post-playtest time, the IDs and prices are finalized in the store
consoles and this JSON.

### 3.1 Product type rationale

- `non_consumable`: premium unlock, cosmetics packs. One-time purchase,
  persistent. **Restore purchases** is required by Apple.
- `consumable` (deferred): gems, energy refills. Not in MVP.
- `subscription` (deferred): battle pass. Not in MVP.

---

## 4. `iapClient` module

```typescript
// src/platform/iap/iapClient.ts
import RNIap, { Product, Purchase, PurchaseError } from 'react-native-iap';

export interface IAPClient {
  // Lifecycle
  init(): Promise<void>;

  // Discovery
  fetchProducts(productIds: string[]): Promise<Product[]>;

  // Purchase
  requestPurchase(productId: string): Promise<Purchase>;

  // Restore
  restorePurchases(): Promise<Purchase[]>;

  // Receipt validation
  validateReceipt(purchase: Purchase): Promise<boolean>;

  // Status
  isOwned(productId: string): boolean;
  getOwnedProductIds(): string[];

  // Events
  onPurchaseSuccess(callback: (purchase: Purchase) => void): () => void;
  onPurchaseError(callback: (error: PurchaseError) => void): () => void;
}

class IAPClientImpl implements IAPClient {
  private ownedIds: Set<string> = new Set();

  async init() {
    await RNIap.initConnection();
    // Listen for purchase updates
    RNIap.purchaseUpdatedListener(this.handlePurchase);
    RNIap.purchaseErrorListener(this.handleError);
    // Load owned from MMKV
    this.ownedIds = new Set(JSON.parse(MMKV.getString('iap_owned_ids') ?? '[]'));
  }

  async fetchProducts(productIds: string[]): Promise<Product[]> {
    return Rniap.getProducts(productIds);
  }

  async requestPurchase(productId: string): Promise<Purchase> {
    return Rniap.requestPurchase(productId);
  }

  async restorePurchases(): Promise<Purchase[]> {
    return Rniap.getAvailablePurchases();
  }

  async validateReceipt(purchase: Purchase): Promise<boolean> {
    // For MVP, accept the receipt if it has a transactionId.
    // In production, validate against Apple/Google servers.
    return !!purchase.transactionId;
  }

  isOwned(productId: string): boolean {
    return this.ownedIds.has(productId);
  }

  private handlePurchase = async (purchase: Purchase) => {
    if (await this.validateReceipt(purchase)) {
      this.ownedIds.add(purchase.productId);
      MMKV.set('iap_owned_ids', JSON.stringify([...this.ownedIds]));
      MMKV.set(`iap_owned_${purchase.productId}`, 'true');
      // Fire event for in-game content unlock
      iapEvents.emit('purchase:success', purchase);
    }
  };

  // ... etc
}

export const iapClient: IAPClient = new IAPClientImpl();
```

---

## 5. Paywall screen (UI)

### 5.1 The screen

`PaywallScreen` (modal) shows:

- Hero image (Athena blessing the player)
- Headline: "Unlock the full Olympian experience"
- Two product cards (Premium, Cosmetics)
- Each card: icon, name, price, "Buy" button
- "Restore Purchases" button at the bottom
- "Continue with limited content" small link (always dismisses)

### 5.2 Component

```typescript
// src/ui/screens/PaywallScreen.tsx
export function PaywallScreen({ route, navigation }: ScreenProps<'Paywall'>) {
  const { source } = route.params;     // 'settings' | 'menu' | 'debug'
  const products = useIAPProducts();
  const owned = useOwnedProductIds();
  const t = useT();

  return (
    <ScreenContainer>
      <Text variant="displayLg">{t('paywall.headline')}</Text>
      <FlatList
        data={products}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            owned={owned.includes(item.id)}
            onBuy={() => handleBuy(item.id)}
          />
        )}
      />
      <Button variant="ghost" onPress={() => iapClient.restorePurchases()}>
        {t('paywall.restore')}
      </Button>
      <Button variant="ghost" onPress={() => navigation.goBack()}>
        {t('paywall.continue_limited')}
      </Button>
    </ScreenContainer>
  );
}
```

### 5.3 Disabled (MVP) state

When `OLYMPIAN_PAYWALL_ENABLED=false`:
- The paywall screen is unreachable from any normal nav flow.
- If a build agent somehow navigates to it, the screen renders
  "Paywall disabled (MVP build)" instead of products.
- The IAP client still initializes and the store connection still
  works (so e2e tests can validate).

---

## 6. IAP states (state machine)

A purchase can be in one of these states:

```
idle
  ↓ requestPurchase()
pending
  ↓ user confirms in store
purchasing
  ↓ success
success → grant content → mark owned
  ↓ user cancels
cancelled
  ↓ error
error → show error toast
```

The IAP client emits events for state transitions. The UI subscribes
via `iapEvents`:

```typescript
// src/platform/iap/iapEvents.ts
import EventEmitter from 'eventemitter3';

export const iapEvents = new EventEmitter<{
  'purchase:started': [productId: string];
  'purchase:success': [purchase: Purchase];
  'purchase:cancelled': [productId: string];
  'purchase:error': [error: PurchaseError, productId: string];
  'restore:completed': [purchases: Purchase[]];
}>();
```

---

## 7. In-game content unlocked by IAP

For MVP, the placeholder rewards are:

| Product | Reward flag | In-game effect |
|---|---|---|
| `olympian_premium_unlock` | `iap_owned_premium` | (no effect yet — placeholder) |
| `olympian_cosmetics_pack_01` | `iap_owned_cosmetics_01` | (no effect yet — placeholder) |

After playtest, real rewards are defined:
- Premium: removes all "ad slots" (if ads are added), unlocks all Acts
  at game start (skip-the-grind)
- Cosmetics: alt skins for hero, exclusive particle effects

The reward check pattern is:

```typescript
// Anywhere in app code
import { iapClient } from '@/platform/iap/iapClient';

if (iapClient.isOwned('olympian_premium_unlock')) {
  // grant premium content
}
```

This is a synchronous check, safe in render and game logic.

---

## 8. Store configuration (for post-MVP)

When products are ready, the developer configures them in:
- **iOS:** App Store Connect → In-App Purchases
- **Android:** Google Play Console → Monetize → Products → In-app
  products

The product IDs in `iap_products.json` must match the store-side IDs
**exactly**.

For iOS, a "Shared Secret" is required for receipt validation. The
shared secret is stored in:
- iOS: `ios/Olympian/Config.xcconfig` (gitignored)
- Android: `android/app/src/main/assets/google-play-key.pem`

For MVP, **no shared secret is needed** because we're not doing server-
side receipt validation. Once a server exists, both are configured.

---

## 9. Restore purchases

Required by Apple. Implemented as:

```typescript
// Settings → "Restore Purchases" button
async function handleRestore() {
  try {
    const purchases = await iapClient.restorePurchases();
    for (const p of purchases) {
      MMKV.set(`iap_owned_${p.productId}`, 'true');
    }
    showToast(t('paywall.restored', { count: purchases.length }));
  } catch (e) {
    showToast(t('paywall.restore_failed'));
  }
}
```

This is reachable from the paywall screen's "Restore" button.

---

## 10. Testing

### 10.1 Sandbox testing

- iOS: Use a sandbox tester account (set up in App Store Connect).
- Android: Use a test account in Google Play Console with
  `android.test.purchased` as a reserved product ID.

The dev workflow:
1. Build a debug APK/IPA.
2. Install on a test device signed in to a sandbox account.
3. Trigger a purchase — confirm the flow works.
4. Restore purchases — confirm the owned flag persists.

### 10.2 Automated tests

`iapClient.test.ts` mocks `react-native-iap` and tests:
- `init()` connects and loads owned IDs from MMKV
- `requestPurchase` fires the success event for valid products
- `restorePurchases` updates owned set correctly
- `isOwned` reflects current state

```typescript
jest.mock('react-native-iap');

it('marks product as owned on successful purchase', async () => {
  await iapClient.init();
  await iapClient.requestPurchase('olympian_premium_unlock');
  // Simulate purchase success callback
  iapEvents.emit('purchase:success', mockPurchase);
  expect(iapClient.isOwned('olympian_premium_unlock')).toBe(true);
});
```

### 10.3 Manual test checklist (for build agents)

- [ ] `OLYMPIAN_PAYWALL_ENABLED=false` → paywall unreachable
- [ ] `OLYMPIAN_PAYWALL_ENABLED=true` (dev) → paywall reachable from
      hidden debug menu
- [ ] Products load (with mock data in dev) or fail gracefully (in
      production with no products configured)
- [ ] "Buy" button → triggers native purchase sheet
- [ ] Cancel purchase → no state change
- [ ] Successful purchase → owned flag set, content unlocked
- [ ] Restart app → owned flag persists (MMKV)
- [ ] "Restore Purchases" → all previously owned products re-marked
- [ ] Network failure → graceful error toast

---

## 11. What does NOT exist at MVP (deferred)

- No real product IDs in App Store Connect / Google Play Console
- No real pricing (placeholder $4.99 / $1.99)
- No server-side receipt validation
- No ads SDK integration
- No subscription products
- No consumable products (gems-for-money)
- No promotional pricing or A/B testing
- No paywall analytics (which screen converts best)

These are **out of scope** for the MVP build. Add them post-playtest.

---

## 12. Anti-patterns

1. **No "is the user premium?" UI affordance** at MVP. The flag exists
   but doesn't unlock anything. Adding it would imply a real product.
2. **No "limited time offer" copy** at MVP. The paywall is a stub, not
   a marketing surface.
3. **No automatic restore on app start** at MVP. Only on user action.
4. **No "are you sure?" before purchase** — the OS does that.
5. **No receipt validation** beyond a transactionId presence check.
   Real validation comes with the server.
