/**
 * Tests for the IAP client (spec 13 §4).
 *
 * Verifies:
 *   - initIAP() returns ok(true) on a successful connection.
 *   - fetchProducts() returns the mocked product catalog.
 *   - isOwned() reflects MMKV ownership state.
 *   - restorePurchases() reads from the mocked `getAvailablePurchases`
 *     and persists ownership to MMKV.
 *   - The client degrades gracefully when the native module throws
 *     (no crash, just an ok(false) result).
 *
 * We mock `react-native-iap` with stub implementations of the small
 * surface the client uses. The MMKV layer is mocked too (via the same
 * pattern as `mmkv.test.ts`), so we can assert on ownership state.
 */

import {
  endIAP,
  fetchProducts,
  initIAP,
  isOwned,
  markOwned,
  onPurchaseSuccess,
  purchaseProduct,
  restorePurchases,
  DEFAULT_PRODUCT_IDS,
  PLACEHOLDER_PRODUCTS,
} from '@/platform/iap/iapClient';

// ---------------------------------------------------------------------------
// Mock MMKV (in-memory Map-backed singleton, same as in mmkv.test.ts)
// ---------------------------------------------------------------------------

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, boolean | string | number>();
  const instance = {
    set(key: string, value: boolean | string | number): void {
      store.set(key, value);
    },
    getBoolean(key: string): boolean | undefined {
      const v = store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    getString(key: string): string | undefined {
      const v = store.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber(key: string): number | undefined {
      const v = store.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    contains(key: string): boolean {
      return store.has(key);
    },
    delete(key: string): void {
      store.delete(key);
    },
    getAllKeys(): string[] {
      return Array.from(store.keys());
    },
    clearAll(): void {
      store.clear();
    },
  };
  (globalThis as unknown as { __mockMmkv: typeof instance }).__mockMmkv = instance;
  return {
    MMKV: class {
      constructor() {
        return instance;
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Mock react-native-iap
// ---------------------------------------------------------------------------

/**
 * Mock store state. The mocked IAP functions read from / write to this
 * object so tests can drive specific scenarios (success, error, owned
 * list, etc.).
 */
interface MockIapState {
  connected: boolean;
  products: Array<{
    productId: string;
    title: string;
    description: string;
    price: string;
    currency: string;
    localizedPrice: string;
    type: 'inapp' | 'iap';
  }>;
  availablePurchases: Array<{
    productId: string;
    transactionId?: string;
    transactionDate: number;
    transactionReceipt: string;
  }>;
  purchaseUpdatedCallback: ((p: { productId: string; transactionId?: string; transactionDate: number; transactionReceipt: string }) => void) | null;
  initShouldThrow: boolean;
  fetchProductsShouldThrow: boolean;
  purchaseShouldThrow: boolean;
}

const mockState: MockIapState = {
  connected: false,
  products: PLACEHOLDER_PRODUCTS.map((p) => ({
    productId: p.id,
    title: `Mock ${p.id}`,
    description: 'Mock product',
    price: `$${p.defaultPriceUSD.toFixed(2)}`,
    currency: 'USD',
    localizedPrice: `$${p.defaultPriceUSD.toFixed(2)}`,
    type: 'iap' as const,
  })),
  availablePurchases: [],
  purchaseUpdatedCallback: null,
  initShouldThrow: false,
  fetchProductsShouldThrow: false,
  purchaseShouldThrow: false,
};

jest.mock('react-native-iap', () => {
  return {
    initConnection: async (): Promise<boolean> => {
      if (mockState.initShouldThrow) {
        throw new Error('mock initConnection failure');
      }
      mockState.connected = true;
      return true;
    },
    endConnection: async (): Promise<boolean> => {
      mockState.connected = false;
      return true;
    },
    getProducts: async ({
      skus,
    }: {
      skus: string[];
    }): Promise<
      Array<{
        productId: string;
        title: string;
        description: string;
        price: string;
        currency: string;
        localizedPrice: string;
        type: 'inapp' | 'iap';
      }>
    > => {
      if (mockState.fetchProductsShouldThrow) {
        throw new Error('mock getProducts failure');
      }
      return mockState.products.filter((p) => skus.includes(p.productId));
    },
    getAvailablePurchases: async (): Promise<
      Array<{
        productId: string;
        transactionId?: string;
        transactionDate: number;
        transactionReceipt: string;
      }>
    > => {
      return mockState.availablePurchases;
    },
    requestPurchase: async (_req: { sku: string }): Promise<unknown> => {
      if (mockState.purchaseShouldThrow) {
        throw new Error('mock requestPurchase failure');
      }
      const purchase = {
        productId: _req.sku,
        transactionId: `tx_${Date.now()}`,
        transactionDate: Date.now(),
        transactionReceipt: 'mock-receipt',
      };
      // Fire the purchase-updated listener registered by initIAP().
      mockState.purchaseUpdatedCallback?.(purchase);
      return purchase;
    },
    finishTransaction: async (): Promise<boolean> => true,
    purchaseUpdatedListener: (
      cb: (p: { productId: string; transactionId?: string; transactionDate: number; transactionReceipt: string }) => void,
    ): { remove: () => void } => {
      mockState.purchaseUpdatedCallback = cb;
      return { remove: () => {
        mockState.purchaseUpdatedCallback = null;
      } };
    },
    purchaseErrorListener: (): { remove: () => void } => {
      return { remove: () => undefined };
    },
  };
});

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Tear down any prior IAP connection so each test starts clean.
  await endIAP();
  // Clear MMKV storage.
  (globalThis as unknown as { __mockMmkv: { clearAll: () => void } }).__mockMmkv.clearAll();
  // Reset mock state.
  mockState.connected = false;
  mockState.availablePurchases = [];
  mockState.purchaseUpdatedCallback = null;
  mockState.initShouldThrow = false;
  mockState.fetchProductsShouldThrow = false;
  mockState.purchaseShouldThrow = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IAP client (spec 13 §4)', () => {
  describe('initIAP()', () => {
    it('returns ok(true) on a successful init', async () => {
      const result = await initIAP();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('is idempotent — calling twice returns ok(true) without re-init', async () => {
      const first = await initIAP();
      const second = await initIAP();
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
    });

    it('returns ok(false) (no crash) when initConnection throws', async () => {
      mockState.initShouldThrow = true;
      const result = await initIAP();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('fetchProducts()', () => {
    it('returns the mocked product catalog for the default IDs', async () => {
      const result = await fetchProducts();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(DEFAULT_PRODUCT_IDS.length);
        for (const id of DEFAULT_PRODUCT_IDS) {
          expect(result.value.some((p) => p.productId === id)).toBe(true);
        }
      }
    });

    it('returns only the requested SKUs', async () => {
      const result = await fetchProducts([DEFAULT_PRODUCT_IDS[0]!]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]!.productId).toBe(DEFAULT_PRODUCT_IDS[0]);
      }
    });

    it('returns ok([]) (graceful) when getProducts throws', async () => {
      mockState.fetchProductsShouldThrow = true;
      const result = await fetchProducts();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('purchaseProduct()', () => {
    it('returns ok(purchase) on a successful purchase', async () => {
      await initIAP();
      const result = await purchaseProduct(DEFAULT_PRODUCT_IDS[0]!);
      expect(result.ok).toBe(true);
    });

    it('persists ownership to MMKV after a successful purchase', async () => {
      await initIAP();
      const id = DEFAULT_PRODUCT_IDS[0]!;
      expect(isOwned(id)).toBe(false);
      await purchaseProduct(id);
      // The purchaseUpdatedListener wired up by initIAP() runs
      // synchronously inside requestPurchase (see mock) — ownership
      // should be persisted before the await resolves.
      expect(isOwned(id)).toBe(true);
    });

    it('returns err on a purchase failure', async () => {
      await initIAP();
      mockState.purchaseShouldThrow = true;
      const result = await purchaseProduct(DEFAULT_PRODUCT_IDS[0]!);
      expect(result.ok).toBe(false);
    });
  });

  describe('isOwned() / markOwned()', () => {
    it('returns false for un-marked products', () => {
      expect(isOwned('olympian_premium_unlock')).toBe(false);
    });

    it('returns true after markOwned()', () => {
      markOwned('olympian_premium_unlock');
      expect(isOwned('olympian_premium_unlock')).toBe(true);
    });

    it('markOwned is idempotent', () => {
      markOwned('olympian_premium_unlock');
      markOwned('olympian_premium_unlock');
      expect(isOwned('olympian_premium_unlock')).toBe(true);
    });
  });

  describe('restorePurchases()', () => {
    it('returns the list of restored purchases and persists ownership', async () => {
      await initIAP();
      mockState.availablePurchases = [
        {
          productId: DEFAULT_PRODUCT_IDS[0]!,
          transactionId: 'tx_restore_1',
          transactionDate: Date.now(),
          transactionReceipt: 'mock-receipt-1',
        },
        {
          productId: DEFAULT_PRODUCT_IDS[1]!,
          transactionId: 'tx_restore_2',
          transactionDate: Date.now(),
          transactionReceipt: 'mock-receipt-2',
        },
      ];

      expect(isOwned(DEFAULT_PRODUCT_IDS[0]!)).toBe(false);
      expect(isOwned(DEFAULT_PRODUCT_IDS[1]!)).toBe(false);

      const result = await restorePurchases();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
      expect(isOwned(DEFAULT_PRODUCT_IDS[0]!)).toBe(true);
      expect(isOwned(DEFAULT_PRODUCT_IDS[1]!)).toBe(true);
    });

    it('returns ok([]) when no purchases are available', async () => {
      await initIAP();
      const result = await restorePurchases();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('onPurchaseSuccess()', () => {
    it('fires the registered callback on a successful purchase', async () => {
      await initIAP();
      let captured: { productId: string } | null = null;
      const unsub = onPurchaseSuccess((p) => {
        captured = { productId: p.productId };
      });

      const id = DEFAULT_PRODUCT_IDS[0]!;
      await purchaseProduct(id);

      expect(captured).not.toBeNull();
      expect(captured!.productId).toBe(id);

      unsub();
    });
  });

  describe('endIAP()', () => {
    it('tears down the connection cleanly', async () => {
      await initIAP();
      expect(mockState.connected).toBe(true);
      const result = await endIAP();
      expect(result.ok).toBe(true);
      expect(mockState.connected).toBe(false);
    });

    it('is safe to call when not initialized', async () => {
      const result = await endIAP();
      expect(result.ok).toBe(true);
    });
  });
});
