/**
 * In-App Purchase client — thin wrapper over `react-native-iap`.
 *
 * Spec reference: 13 §4 (`iapClient` module), 02 §3 (Layer 1: Platform).
 *
 * Design:
 *   - All native calls are wrapped in try/catch so the client degrades
 *     gracefully in JS-only / test environments (returns an empty Result
 *     with the captured error instead of throwing).
 *   - Ownership state is persisted in MMKV via the accessors in
 *     `@/platform/storage/mmkv` (spec 02 §9: "persists an `iap_owned`
 *     boolean in MMKV").
 *   - The MVP catalog is stubbed (spec 13 §3); product IDs are placeholders
 *     until post-playtest pricing lands.
 *
 * The full Purchase/PurchaseError event surfaces are exposed via
 * `onPurchaseSuccess` / `onPurchaseError` listeners, which delegate to
 * `react-native-iap`'s event emitter. Listeners return an unsubscribe
 * function — call it on unmount to prevent leaks.
 */

import {
  endConnection,
  fetchProducts as fetchProductsNative,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

import type { EmitterSubscription } from 'react-native';
import { logger } from '@/shared/log';
import {
  addOwnedIapId,
  getOwnedIapIds,
  isIapOwned,
  setOwnedIapIds,
} from '@/platform/storage/mmkv';
import { err, ok, type Result } from '@/shared/result';
import { TypedEventEmitter } from '@/shared/eventEmitter';

/** Events emitted by the IAP client. */
interface IAPClientEvents {
  purchaseSuccess: Purchase;
  purchaseError: PurchaseError;
}

/**
 * MVP placeholder product catalog (spec 13 §3). Real product IDs and
 * prices land post-playtest; these are placeholders so the integration
 * code paths are exercised end-to-end.
 */
export const PLACEHOLDER_PRODUCTS = [
  {
    id: 'olympian_premium_unlock',
    tier: 'premium',
    defaultPriceUSD: 4.99,
    reward: 'iap_owned_premium',
  },
  {
    id: 'olympian_cosmetics_pack_01',
    tier: 'cosmetic',
    defaultPriceUSD: 1.99,
    reward: 'iap_owned_cosmetics_01',
  },
] as const;

/** MVP product IDs to fetch when calling `fetchProducts()` with no args. */
export const DEFAULT_PRODUCT_IDS: readonly string[] = PLACEHOLDER_PRODUCTS.map(
  (p) => p.id,
);

/** True after a successful `initIAP()` call. */
let _initialized = false;

/** Active native listener subscriptions, cleared on `endIAP()`. */
let _purchaseUpdatedSub: EmitterSubscription | null = null;
let _purchaseErrorSub: EmitterSubscription | null = null;

/** Internal event bus for client-side listeners. */
const _events = new TypedEventEmitter<IAPClientEvents>();

/**
 * Initialize the IAP connection. Idempotent — calling twice is a no-op.
 *
 * Wires up `purchaseUpdatedListener` and `purchaseErrorListener` so
 * successful purchases update MMKV ownership, and errors are surfaced
 * via the `onPurchaseError` listener.
 *
 * @returns Result.ok(true) when the store connection is live,
 *          Result.ok(false) when running in an environment where IAP is
 *          unavailable (e.g. test/JS-only), Result.err on hard failure.
 */
export async function initIAP(): Promise<Result<boolean, Error>> {
  if (_initialized) {
    return ok(true);
  }

  try {
    const connected = await initConnection();
    logger.info(`[iap] initConnection returned ${connected}`);
    _initialized = true;

    // Wire native listeners. Wrap callbacks in try/catch so a handler
    // bug doesn't crash the app — purchase failures are surfaced, not
    // thrown.
    try {
      _purchaseUpdatedSub = purchaseUpdatedListener((purchase) => {
        handlePurchase(purchase).catch((e) => {
          logger.warn('[iap] purchase handler failed', e);
        });
      });
    } catch (e) {
      logger.warn('[iap] purchaseUpdatedListener setup failed', e);
    }

    try {
      _purchaseErrorSub = purchaseErrorListener((error) => {
        logger.warn('[iap] purchase error', error);
        _events.emit('purchaseError', error);
      });
    } catch (e) {
      logger.warn('[iap] purchaseErrorListener setup failed', e);
    }

    return ok(connected);
  } catch (e) {
    // JS-only / no native module available: don't crash, just report
    // "not connected" so the rest of the app can continue without IAP.
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn('[iap] initConnection failed, IAP disabled', error);
    return ok(false);
  }
}

/**
 * Fetch the catalog of available products from the store.
 *
 * @param productIds SKUs to look up. Defaults to {@link DEFAULT_PRODUCT_IDS}
 *                   (the MVP placeholder catalog) when omitted.
 * @returns Result.ok(Product[]) — empty array when IAP is unavailable or
 *          the store returned no products.
 */
export async function fetchProducts(
  productIds: readonly string[] = DEFAULT_PRODUCT_IDS,
): Promise<Result<Product[], Error>> {
  if (!_initialized) {
    const init = await initIAP();
    if (!init.ok) return init;
  }

  try {
    const products = await fetchProductsNative({ skus: [...productIds], type: 'in-app' });
    // The library shares one return type across product and subscription
    // queries; this wrapper only requests regular in-app products.
    return ok((products ?? []) as Product[]);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn('[iap] fetchProducts failed', error);
    // Graceful degradation — return empty list, callers treat as
    // "no products available".
    return ok([]);
  }
}

/**
 * Return type of `requestPurchase` from `react-native-iap`. Can be a single
 * `ProductPurchase`, an array of `ProductPurchase`s (Android multi-SKU),
 * or `void` depending on platform / StoreKit version.
 */
export type PurchaseResult = ReturnType<typeof requestPurchase> extends Promise<infer T>
  ? T
  : never;

/**
 * Request a purchase for the given product id. The actual purchase result
 * arrives asynchronously via the `purchaseUpdatedListener` wired up in
 * {@link initIAP}; this function resolves once the request is dispatched.
 *
 * On success, ownership is persisted to MMKV and the `purchaseSuccess`
 * event is emitted.
 */
export async function purchaseProduct(
  productId: string,
): Promise<Result<Awaited<PurchaseResult>, Error>> {
  if (!_initialized) {
    const init = await initIAP();
    if (!init.ok) return init;
  }

  try {
    // The current IAP API requires platform-specific request data. Supplying
    // both platforms keeps this wrapper usable on Android and iOS.
    const result = await requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: 'in-app',
    });
    return ok(result);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn(`[iap] purchaseProduct("${productId}") failed`, error);
    return err(error);
  }
}

/**
 * Restore previously-purchased non-consumable items.
 *
 * Calls `getAvailablePurchases()` and updates MMKV ownership for every
 * returned purchase that has a `productId`. Returns the list of restored
 * purchases so callers can show a "Restored: X items" toast.
 *
 * Spec: Apple requires a "Restore Purchases" button for non-consumable
 * IAP (App Store Review Guideline 3.1.1).
 */
export async function restorePurchases(): Promise<Result<Purchase[], Error>> {
  if (!_initialized) {
    const init = await initIAP();
    if (!init.ok) return init;
  }

  try {
    const purchases = await getAvailablePurchases();
    // Persist ownership for every returned purchase.
    const ownedIds = new Set<string>(getOwnedIapIds());
    for (const p of purchases) {
      if (p.productId) {
        ownedIds.add(p.productId);
      }
    }
    setOwnedIapIds(Array.from(ownedIds));
    return ok(purchases);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn('[iap] restorePurchases failed', error);
    return ok([]);
  }
}

/**
 * True if the given product id is marked as owned in MMKV. Ownership is
 * persisted after a successful purchase or restore.
 */
export function isOwned(productId: string): boolean {
  return isIapOwned(productId);
}

/** Return the current list of owned product ids (read from MMKV). */
export function getOwnedProductIds(): string[] {
  return getOwnedIapIds();
}

/**
 * Mark a product as owned (used by `handlePurchase` and tests). Idempotent.
 */
export function markOwned(productId: string): void {
  addOwnedIapId(productId);
}

/**
 * Register a callback for successful purchases. Returns an unsubscribe
 * function — call it on unmount to prevent leaks.
 */
export function onPurchaseSuccess(
  cb: (purchase: Purchase) => void,
): () => void {
  return _events.on('purchaseSuccess', cb);
}

/** Register a callback for purchase errors. Returns an unsubscribe function. */
export function onPurchaseError(
  cb: (error: PurchaseError) => void,
): () => void {
  return _events.on('purchaseError', cb);
}

/**
 * Tear down the IAP connection and remove all listeners. Safe to call
 * when not initialized.
 */
export async function endIAP(): Promise<Result<boolean, Error>> {
  try {
    _purchaseUpdatedSub?.remove();
    _purchaseErrorSub?.remove();
    _purchaseUpdatedSub = null;
    _purchaseErrorSub = null;
    _initialized = false;
    await endConnection();
    return ok(true);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.warn('[iap] endConnection failed', error);
    return ok(false);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Handle a successful purchase event from the store:
 *   1. (MVP) Trust the receipt if it has a transactionId — no server validation.
 *   2. Persist ownership to MMKV.
 *   3. Finish the transaction so the store stops re-delivering it.
 *   4. Emit `purchaseSuccess` to client-side listeners.
 */
async function handlePurchase(purchase: Purchase): Promise<void> {
  const valid = await validateReceipt(purchase);
  if (!valid) {
    logger.warn('[iap] receipt validation failed, ignoring purchase', purchase);
    return;
  }

  if (purchase.productId) {
    markOwned(purchase.productId);
  }

  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (e) {
    logger.warn('[iap] finishTransaction failed', e);
  }

  _events.emit('purchaseSuccess', purchase);
}

/**
 * MVP receipt validation: accept any purchase with a `transactionId`.
 * In production this would call Apple/Google's server-side verifyReceipt
 * endpoints (spec 13 §4 `validateReceipt`).
 */
export async function validateReceipt(purchase: Purchase): Promise<boolean> {
  return Boolean(purchase.transactionId);
}
