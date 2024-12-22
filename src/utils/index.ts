import { DexterityError } from "../types";
import { CACHE_CONFIG } from "../constants";
import { createClient, Client } from "@stacks/blockchain-api-client";
import { StacksNetwork } from "@stacks/network";
import {
  generateNewAccount,
  generateWallet,
  getStxAddress,
} from "@stacks/wallet-sdk";
import { Dexterity } from "../core/sdk";

let clientInstance: Client<any, any> | null = null;

export function getClient(network: StacksNetwork): Client<any, any> {
  if (!clientInstance) {
    clientInstance = createClient({
      baseUrl: network.client.baseUrl,
    });

    // Check for API key in env vars
    const apiKey = process.env.HIRO_API_KEY || process.env.STACKS_API_KEY;
    if (apiKey) {
      clientInstance.use({
        onRequest({ request }) {
          request.headers.set("x-hiro-api-key", apiKey);
        },
      });
    }
  }

  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
}

/**
 * Result type for better error handling
 */
export class Result<T, E = DexterityError> {
  private constructor(
    private readonly value: T | unknown,
    private readonly error: E | unknown
  ) {}

  static ok<T, E>(value: T): Result<T, E> {
    return new Result(value, null);
  }

  static err<T, E>(error: E): Result<T, E> {
    return new Result(null, error);
  }

  isOk(): boolean {
    return this.error === null;
  }

  isErr(): boolean {
    return this.error !== null;
  }

  unwrap(): T {
    if (this.isOk()) return this.value as T;
    throw this.error;
  }

  unwrapOr(defaultValue: T): T {
    return this.isOk() ? (this.value as T) : defaultValue;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return this.isOk()
      ? Result.ok(fn(this.value as T))
      : Result.err(this.error as E);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return this.isOk()
      ? Result.ok(this.value as T)
      : Result.err(fn(this.error as E));
  }

  match<U>(ok: (value: T) => U, err: (error: E) => U): U {
    return this.isOk() ? ok(this.value as T) : err(this.error as E);
  }
}

/**
 * Cache implementation with TTL support
 */
interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export class Cache {
  private static instance: Cache;
  private items: Map<string, CacheEntry<any>>;
  private itemCount: number;

  private constructor() {
    this.items = new Map();
    this.itemCount = 0;
  }

  static getInstance(): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache();
    }
    return Cache.instance;
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

  get<T>(key: string): T | undefined {
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

/**
 * Helper functions for numeric operations with proper precision handling
 */
export const NumberUtils = {
  /**
   * Converts a number to the contract's precision
   */
  toContractPrecision(amount: number): number {
    return Math.floor(amount * Math.pow(10, 6));
  },

  /**
   * Converts a number from contract precision to normal number
   */
  fromContractPrecision(amount: number): number {
    return amount / Math.pow(10, 6);
  },

  /**
   * Calculates price impact as a percentage
   */
  calculatePriceImpact(
    inputAmount: number,
    outputAmount: number,
    inputReserve: number,
    outputReserve: number
  ): number {
    const expectedPrice = outputReserve / inputReserve;
    const actualPrice = outputAmount / inputAmount;
    return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;
  },
};

/**
 * Helper functions for contract interactions
 */
export const ContractUtils = {
  /**
   * Splits a contract ID into address and name
   */
  parseContractId(contractId: string): [string, string] {
    const [address, name] = contractId.split(".");
    if (!address || !name) {
      throw new Error(`Invalid contract ID: ${contractId}`);
    }
    return [address, name];
  },

  /**
   * Creates a full contract ID from address and name
   */
  createContractId(address: string, name: string): string {
    return `${address}.${name}`;
  },

  /**
   * Validates a contract ID format
   */
  isValidContractId(contractId: string): boolean {
    try {
      const [address, name] = this.parseContractId(contractId);
      return address.startsWith("SP") && name.length > 0;
    } catch {
      return false;
    }
  },
};

/**
 * Helper functions for error handling
 */
export const ErrorUtils = {
  /**
   * Creates a DexterityError with the given code and message
   */
  createError(code: number, message: string, details?: any): DexterityError {
    const error = new Error(message) as DexterityError;
    error.code = code;
    error.details = details;
    return error;
  },
};

export async function deriveSigner(index = 0) {
  if (process.env.SEED_PHRASE) {
    // using a blank password since wallet isn't persisted
    const password = "";
    // create a Stacks wallet with the mnemonic
    let wallet = await generateWallet({
      secretKey: process.env.SEED_PHRASE,
      password: password,
    });
    // add a new account to reach the selected index
    for (let i = 0; i <= index; i++) {
      wallet = generateNewAccount(wallet);
    }
    // return address and key for selected index
    const stxAddress = getStxAddress(
      wallet.accounts[index],
      Dexterity.config.network
    );

    Dexterity.config.mode = "server";
    Dexterity.config.privateKey = wallet.accounts[index].stxPrivateKey;
    Dexterity.config.stxAddress = stxAddress;
  } else {
    Dexterity.config.mode = "client";
  }
}
