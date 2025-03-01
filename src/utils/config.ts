import { z } from "zod";
import { StacksNetworks } from "@stacks/network";
import type { SDKConfig } from "../types";
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";
import { Dexterity } from "../core/sdk";

const isNode = typeof window === 'undefined';

// Config file locations in order of precedence
export const CONFIG_LOCATIONS = [
  '.dexterity.json',
  path.join(homedir(), '.dexterity/config.json'),
  '/etc/dexterity/config.json'
] as const;

// Default CLI config location
export const CLI_CONFIG_DIR = path.join(homedir(), '.dexterity');
export const CLI_CONFIG_FILE = path.join(CLI_CONFIG_DIR, 'config.json');

export const DEFAULT_SDK_CONFIG: SDKConfig = {
  apiKey: "",
  apiKeys: undefined,
  apiKeyRotation: "random",
  privateKey: "",
  sponsored: false,
  sponsor: "https://charisma.rocks/api/v0/sponsor",
  mode: "server",
  stxAddress: "",
  proxy: "https://charisma.rocks/api/v0/proxy",
  ipfsGateway: "https://ipfs.io/",
  network: 'mainnet',
  defaultSlippage: 0.01,
  maxHops: 3,
  debug: false,
  preferredPools: [],
  routerAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  routerName: "multihop",
  parallelRequests: 10,
  retryDelay: 3000,
};

// Single source of truth for config validation
export const ConfigSchema = z.object({
  network: z.enum(['mainnet', 'testnet'] as const),
  mode: z.enum(["client", "server"]),
  maxHops: z.coerce.number().int().min(1).max(9),
  defaultSlippage: z.coerce.number().min(0).max(1),
  proxy: z.string().url(),
  apiKey: z.string().optional(),
  apiKeys: z.preprocess(
    (val) => typeof val === 'string' ? val.split(',').map(v => v.trim()).filter(Boolean) : val,
    z.array(z.string())
  ).optional(),
  apiKeyRotation: z.enum(["random"]).optional(),
  debug: z.preprocess((val) => val === 'true', z.boolean()),
  parallelRequests: z.coerce.number().int().min(1).max(10),
  routerAddress: z.string(),
  routerName: z.string(),
  privateKey: z.string().optional(),
  stxAddress: z.string().optional(),
  sponsored: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  sponsor: z.string().url().optional(),
  ipfsGateway: z.string().url().optional(),
  retryDelay: z.coerce.number().int().min(0).optional(),
}).partial();

export type ValidatedConfig = z.infer<typeof ConfigSchema>;

// Environment variable mapping
const ENV_VAR_MAP = {
  DEXTERITY_MODE: 'mode',
  DEXTERITY_DEBUG: 'debug',
  DEXTERITY_NETWORK: 'network',
  DEXTERITY_MAX_HOPS: 'maxHops',
  DEXTERITY_PROXY_URL: 'proxy',
  DEXTERITY_DEFAULT_SLIPPAGE: 'defaultSlippage',
  DEXTERITY_PARALLEL_REQUESTS: 'parallelRequests',
  DEXTERITY_ROUTER_ADDRESS: 'routerAddress',
  DEXTERITY_ROUTER_NAME: 'routerName',
  DEXTERITY_SPONSORED: 'sponsored',
  DEXTERITY_SPONSOR_URL: 'sponsor',
  DEXTERITY_IPFS_GATEWAY: 'ipfsGateway',
  DEXTERITY_RETRY_DELAY: 'retryDelay',
  HIRO_API_KEY: 'apiKey',
  HIRO_API_KEYS: 'apiKeys',
  STACKS_API_KEY: 'apiKey', // Fallback for legacy support
  STX_ADDRESS: 'stxAddress',
  PRIVATE_KEY: 'privateKey',
} as const;

// Simple environment config loading
function loadEnvironmentConfig(): Partial<SDKConfig> {
  const envConfig: Record<string, unknown> = {};
  const warnings: string[] = [];

  // Map environment variables to config keys
  for (const [envKey, configKey] of Object.entries(ENV_VAR_MAP)) {
    const value = process.env[envKey];
    if (value) {
      envConfig[configKey] = value;
    }
  }

  // Special handling for API keys to maintain priority
  if (process.env.HIRO_API_KEYS) {
    const apiKeys = process.env.HIRO_API_KEYS.split(',').map(v => v.trim()).filter(Boolean);
    envConfig.apiKeys = apiKeys;
    if (apiKeys.length > 0) {
      envConfig.apiKey = apiKeys[0];
    }
  } else if (process.env.HIRO_API_KEY || process.env.STACKS_API_KEY) {
    const key = process.env.HIRO_API_KEY || process.env.STACKS_API_KEY;
    if (key) {
      envConfig.apiKey = key;
      envConfig.apiKeys = [key];
    }
  }

  try {
    return ConfigSchema.parse(envConfig) as Partial<SDKConfig>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      warnings.push(...error.errors.map(e => `Invalid configuration: ${e.path.join('.')}: ${e.message}`));
    }
    // Log warnings if debug is enabled in process.env
    if (process.env.DEXTERITY_DEBUG === 'true') {
      console.warn('Configuration warnings:', warnings);
    }
    // Return partial valid config
    return ConfigSchema.parse(envConfig) as Partial<SDKConfig>;
  }
}

// Load and validate configuration
export async function loadConfig(runtimeConfig?: Partial<SDKConfig>): Promise<SDKConfig> {
  // Start with default config to ensure all required fields
  const config = {
    ...DEFAULT_SDK_CONFIG,
    ...Dexterity.config,
    ...loadEnvironmentConfig(),
    ...runtimeConfig
  } as SDKConfig;

  // Set mode based on environment if not explicitly specified
  if (!runtimeConfig?.mode) {
    config.mode = isNode ? 'server' : 'client';
  }

  // Prevent loading @stacks/connect in Node environment
  if (isNode && config.mode === 'client') {
    throw new Error('Client mode is not supported in Node.js environment');
  }

  // Handle signer if needed
  if (process.env.SEED_PHRASE) {
    const wallet = await generateWallet({
      secretKey: process.env.SEED_PHRASE,
      password: "",
    });
    config.mode = "server";
    config.privateKey = wallet.accounts[0].stxPrivateKey;
    config.stxAddress = getStxAddress(wallet.accounts[0], config.network);
  } else {
    if (config.mode === 'server') {
      throw new Error("Server mode requires 'SEED_PHRASE' environment variable to be set");
    }
  }

  // Validate the final configuration
  const validatedConfig = ConfigSchema.parse(config);

  // Since we started with DEFAULT_SDK_CONFIG, we know we have all required fields
  return validatedConfig as SDKConfig;
}