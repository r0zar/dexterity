import { CacheProvider } from "../../types";

export class CustomCache implements CacheProvider {
  constructor(private callback: (key: string) => Promise<any>) {}

  async getOrSet<T>(
    key: string,
    _fetchFn: () => Promise<T>,
    _ttlMs?: number
  ): Promise<T> {
    return this.callback(key);
  }

  set<T>(_key: string, _value: T, _ttlMs?: number): void {
    // No-op for callback-based cache
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.callback(key);
  }

  invalidate(_key: string): void {
    // No-op for callback-based cache
  }

  clear(): void {
    // No-op for callback-based cache
  }
}
