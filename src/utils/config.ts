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
  parallelRequests: 1,
  heliusApiKey: "",
};

// Single source of truth for config validation
export const ConfigSchema = z.object({
  network: z.enum(StacksNetworks),
  mode: z.enum(["client", "server"]),
  maxHops: z.number().int().min(1).max(9),
  defaultSlippage: z.number().min(0).max(1),
  proxy: z.string().url(),
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).optional(),
  debug: z.boolean(),
  parallelRequests: z.number().int().min(1).max(10),
  preferredPools: z.array(z.string()),
  routerAddress: z.string(),
  routerName: z.string(),
  privateKey: z.string().optional(),
  stxAddress: z.string().optional(),
}).partial();

export type ValidatedConfig = z.infer<typeof ConfigSchema>;

// Simple file operations
function loadFileConfig(): Partial<SDKConfig> {
  for (const location of CONFIG_LOCATIONS) {
    try {
      if (fs.existsSync(location)) {
        return JSON.parse(fs.readFileSync(location, 'utf8'));
      }
    } catch (error) {
      console.warn(`Failed to load config from ${location}`);
    }
  }
  return {};
}

// Simple environment config loading
function loadEnvironmentConfig(): Partial<SDKConfig> {
  const config: Partial<SDKConfig> = {};

  if (process.env.HIRO_API_KEYS) {
    config.apiKeys = process.env.HIRO_API_KEYS.split(',').filter(Boolean);
    config.apiKey = config.apiKeys[0];
  } else if (process.env.HIRO_API_KEY || process.env.STACKS_API_KEY) {
    const key = process.env.HIRO_API_KEY || process.env.STACKS_API_KEY;
    config.apiKey = key;
    config.apiKeys = [key!];
  }

  if (process.env.HELIUS_API_KEY) {
    config.heliusApiKey = process.env.HELIUS_API_KEY;
  }

  return config;
}

// Load and validate configuration
export async function loadConfig(runtimeConfig?: Partial<SDKConfig>): Promise<SDKConfig> {
  const config = {
    ...Dexterity.config,
    ...loadEnvironmentConfig(),
    ...loadFileConfig(),
    ...runtimeConfig
  };

  // Set mode based on environment if not explicitly specified
  if (!runtimeConfig?.mode) {
    config.mode = isNode ? 'server' : 'client';
  }

  // Validate with Zod
  ConfigSchema.parse(config);

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
  }

  return config;
}