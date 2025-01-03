import { CacheProvider } from "../../types";

export class CharismaCache implements CacheProvider {
  private baseUrl: string;

  constructor(baseUrl: string = "https://charisma.rocks") {
    this.baseUrl = baseUrl;
  }

  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlMs?: number): Promise<T> {
    // If the key starts with 'token:', attempt to fetch from HTTP endpoint
    if (key.startsWith("token:")) {
      const contractId = key.replace("token:", "");
      try {
        const response = await fetch(
          `${this.baseUrl}/api/v0/sip10/${contractId}`
        );
        if (response.ok) {
          const data = await response.json();
          return {
            contractId: data.contractId,
            identifier: data.identifier,
            name: data.name,
            symbol: data.symbol,
            decimals: data.decimals,
            description: data.description || "",
            image: data.image || "",
          } as T;
        }
      } catch (error) {
        console.warn(`Failed to fetch from HTTP cache: ${error}`);
      }
    }

    // Fallback to original fetcher for non-token requests or if HTTP fails
    return fetchFn();
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (key.startsWith("token:")) {
      const contractId = key.replace("token:", "");
      try {
        const response = await fetch(
          `${this.baseUrl}/api/v0/sip10/${contractId}`
        );
        if (response.ok) {
          return (await response.json()) as T;
        }
      } catch (error) {
        console.warn(`Failed to fetch from HTTP cache: ${error}`);
      }
    }
    return undefined;
  }

  // These methods are no-ops since we're using an HTTP endpoint as our source of truth
  set<T>(_key: string, _value: T): void { }
  invalidate(_key: string): void { }
  clear(): void { }
}
