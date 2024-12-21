import { STACKS_MAINNET } from "@stacks/network";
import type { SDKConfig } from "../types";

export const DEFAULT_SDK_CONFIG: SDKConfig = {
  apiKey: process.env.HIRO_API_KEY || process.env.STACKS_API_KEY || "",
  mode: "client",
  stxAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  network: STACKS_MAINNET,
  defaultSlippage: 0.5,
  maxHops: 5,
  pools: [],
  preferredPools: [],
  routerAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  routerName: "multihop",
  minimumLiquidity: 1000,
  discovery: {
    startBlock: 0,
    batchSize: 1000,
    parallelRequests: 1,
    refreshInterval: 300000,
    cacheConfig: {
      ttl: 300000,
      maxItems: 100,
    },
  },
} as const;

export function validateConfig(config?: Partial<SDKConfig>): SDKConfig {
  const finalConfig = {
    ...DEFAULT_SDK_CONFIG,
    ...config,
  };

  // Validate required fields
  if (!finalConfig.network) {
    throw new Error("Network configuration is required");
  }

  if (
    typeof finalConfig.defaultSlippage !== "number" ||
    finalConfig.defaultSlippage <= 0 ||
    finalConfig.defaultSlippage > 100
  ) {
    throw new Error("Default slippage must be a number between 0 and 100");
  }

  // Validate optional numeric fields
  if (
    finalConfig.maxHops !== undefined &&
    (finalConfig.maxHops < 1 || finalConfig.maxHops > 5)
  ) {
    throw new Error("Max hops must be between 1 and 5");
  }

  // Validate pools if provided
  if (finalConfig.pools) {
    if (!Array.isArray(finalConfig.pools)) {
      throw new Error("Pools must be an array");
    }

    // Basic validation of pool structure
    for (const pool of finalConfig.pools) {
      if (!pool.contractId || !pool.liquidity || pool.liquidity.length !== 2) {
        throw new Error("Invalid pool configuration");
      }
    }
  }

  return finalConfig;
}
