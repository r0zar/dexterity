import { CacheProvider } from "../../types";

export class CustomCache implements CacheProvider {
  constructor(
    private callbacks: {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any, ttlMs?: number) => Promise<void>;
    }
  ) {}

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.callbacks.get(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch (error) {
      console.warn(`Cache miss for key: ${key}`);
    }

    // If not in cache or error, use fetch function
    const value = await fetchFn();

    // Store the fetched value in cache
    try {
      await this.callbacks.set(key, value, ttlMs);
    } catch (error) {
      console.warn(`Failed to set cache for key: ${key}`);
    }

    return value;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.callbacks.get(key);
      if (value !== null && value !== undefined) {
        return value;
      }
    } catch (error) {
      console.warn(`Cache get failed for key: ${key}`);
    }
    return undefined;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      await this.callbacks.set(key, value, ttlMs);
    } catch (error) {
      console.warn(`Failed to set cache for key: ${key}`);
    }
  }

  invalidate(_key: string): void {
    // Implement if you want to support cache invalidation
  }

  clear(): void {
    // Implement if you want to support cache clearing
  }
}
