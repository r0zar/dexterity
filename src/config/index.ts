import { STACKS_MAINNET } from "@stacks/network";
import type { SDKConfig } from "../types";
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const CONFIG_LOCATIONS = [
  '.dexterity.json',
  path.join(homedir(), '.dexterity/config.json'),
  '/etc/dexterity/config.json'
] as const;

export const DEFAULT_SDK_CONFIG: SDKConfig = {
  apiKey: "",
  apiKeys: undefined,
  privateKey: "",
  mode: "server",
  stxAddress: "",
  proxy: "https://charisma.rocks/api/v0/proxy",
  network: STACKS_MAINNET,
  defaultSlippage: 0,
  maxHops: 3,
  preferredPools: [],
  routerAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  routerName: "multihop",
  minimumLiquidity: 1000,
  discovery: {
    startBlock: 0,
    batchSize: 1000,
    parallelRequests: 1,
    refreshInterval: 300000,
  },
};

function loadEnvironmentConfig(): Partial<SDKConfig> {
  const config: Partial<SDKConfig> = {};
  const DEFAULT_API_KEY = process.env.HIRO_API_KEY || process.env.STACKS_API_KEY
  
  // Load API keys from environment
  if (process.env.HIRO_API_KEYS) {
    config.apiKeys = process.env.HIRO_API_KEYS.split(',').filter(Boolean);
    config.apiKey = config.apiKeys[0];
  } else if (DEFAULT_API_KEY) {
    config.apiKey = DEFAULT_API_KEY;
    config.apiKeys = [DEFAULT_API_KEY];
  }

  return config;
}

function loadFileConfig(): Partial<SDKConfig> {
  for (const location of CONFIG_LOCATIONS) {
    try {
      if (fs.existsSync(location)) {
        const config = JSON.parse(fs.readFileSync(location, 'utf8'));
        return config;
      }
    } catch (error) {
      console.warn(`Failed to load config from ${location}`);
    }
  }
  return {};
}

function validateConfig(config: SDKConfig): void {
  if (!config.network) {
    throw new Error("Network configuration is required");
  }

  if (!config.apiKeys?.length && !config.apiKey) {
    throw new Error("At least one API key is required");
  }

  if (
    config.maxHops !== undefined &&
    (config.maxHops < 1 || config.maxHops > 5)
  ) {
    throw new Error("Max hops must be between 1 and 5");
  }

  if (
    typeof config.defaultSlippage !== "number" ||
    config.defaultSlippage < 0 ||
    config.defaultSlippage > 100
  ) {
    throw new Error("Default slippage must be a number between 0 and 100");
  }
}

export function loadConfig(runtimeConfig?: Partial<SDKConfig>): SDKConfig {
  // Build config with priority (later sources override earlier ones):
  // 1. Default config
  // 2. Environment variables
  // 3. Config files
  // 4. Runtime config
  const config = {
    ...DEFAULT_SDK_CONFIG,
    ...loadEnvironmentConfig(),
    ...loadFileConfig(),
  };

  // If runtime config contains API keys, they should completely override environment values
  if (runtimeConfig?.apiKeys || runtimeConfig?.apiKey) {
    config.apiKeys = runtimeConfig.apiKeys || (runtimeConfig.apiKey ? [runtimeConfig.apiKey] : undefined);
    config.apiKey = runtimeConfig.apiKey || (config.apiKeys ? config.apiKeys[0] : "");
  }

  // Apply remaining runtime config
  const finalConfig = {
    ...config,
    ...runtimeConfig
  };

  validateConfig(finalConfig);
  return finalConfig;
}
