import { CACHE_CONFIG } from "../../constants";
import { CacheEntry, CacheProvider } from "../../types";

// Default memory cache implementation
export class MemoryCache implements CacheProvider {
  private static instance: MemoryCache;
  private items: Map<string, CacheEntry<any>>;
  private itemCount: number;

  private constructor() {
    this.items = new Map();
    this.itemCount = 0;
  }

  static getInstance(): MemoryCache {
    if (!MemoryCache.instance) {
      MemoryCache.instance = new MemoryCache();
    }
    return MemoryCache.instance;
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number = CACHE_CONFIG.DEFAULT_TTL
  ): Promise<T> {
    const entry = this.items.get(key);
    const now = Date.now();

    if (entry && now < entry.expiry) {
      return entry.value;
    }

    const value = await fetchFn();
    this.set(key, value, ttlMs);
    return value;
  }

  set<T>(
    key: string,
    value: T,
    ttlMs: number = CACHE_CONFIG.DEFAULT_TTL
  ): void {
    // If we're at max capacity and adding a new item, remove the oldest one
    if (!this.items.has(key) && this.itemCount >= CACHE_CONFIG.MAX_ITEMS) {
      const oldestKey = this.items.keys().next().value;
      this.items.delete(oldestKey!);
      this.itemCount--;
    }

    this.items.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });

    if (!this.items.has(key)) {
      this.itemCount++;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.items.get(key);
    const now = Date.now();

    if (!entry || now >= entry.expiry) {
      this.items.delete(key);
      if (entry) this.itemCount--;
      return undefined;
    }

    return entry.value;
  }

  invalidate(key: string): void {
    if (this.items.delete(key)) {
      this.itemCount--;
    }
  }

  clear(): void {
    this.items.clear();
    this.itemCount = 0;
  }
}
