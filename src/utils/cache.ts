import { CACHE_CONFIG } from "../constants";

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export class Cache {
  private static items = new Map<string, CacheEntry<any>>();
  private static itemCount = 0;

  static async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number = CACHE_CONFIG.DEFAULT_TTL
  ): Promise<T> {
    const entry = Cache.items.get(key);
    const now = Date.now();

    if (entry && now < entry.expiry) {
      return entry.value;
    }

    const value = await fetchFn();
    Cache.set(key, value, ttlMs);
    return value;
  }

  static set<T>(key: string, value: T, ttlMs: number = CACHE_CONFIG.DEFAULT_TTL): void {
    if (!Cache.items.has(key) && Cache.itemCount >= CACHE_CONFIG.MAX_ITEMS) {
      const oldestKey = Cache.items.keys().next().value;
      Cache.items.delete(oldestKey!);
      Cache.itemCount--;
    }

    Cache.items.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });

    if (!Cache.items.has(key)) {
      Cache.itemCount++;
    }
  }

  static get<T>(key: string): T | undefined {
    const entry = Cache.items.get(key);
    const now = Date.now();

    if (!entry || now >= entry.expiry) {
      Cache.items.delete(key);
      if (entry) Cache.itemCount--;
      return undefined;
    }

    return entry.value;
  }

  static invalidate(key: string): void {
    if (Cache.items.delete(key)) {
      Cache.itemCount--;
    }
  }

  static clear(): void {
    Cache.items.clear();
    Cache.itemCount = 0;
  }
}