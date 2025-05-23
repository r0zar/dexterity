import { StacksNetwork } from "@stacks/network";
import { Vault } from "../core/vault";
import { Opcode } from "../core/opcode";

/**
 * Token Types
 */

export type ContractId = `${string}.${string}`;

export interface Token {
  contractId: ContractId;
  identifier: string;
  name: string;
  symbol: string;
  decimals: number;
  supply?: number;
  image?: string;
  description?: string;
}

export interface Liquidity extends Token {
  reserves: number;
}

export interface LPToken extends Token {
  liquidity: Liquidity[];
  externalPoolId?: ContractId;
  engineContractId?: ContractId;
  fee: number;
}

/**
 * Quote & Transaction Types
 */
export interface Quote {
  amountIn: number;
  amountOut: number;
  expectedPrice: number;
  minimumReceived: number;
  fee: number;
}

export interface Delta {
  dx: number;
  dy: number;
  dk: number;
}

/**
 * Route Types
 */
export interface Hop {
  vault: Vault;
  tokenIn: Token;
  tokenOut: Token;
  opcode: Opcode;
  quote?: {
    amountIn: number;
    amountOut: number;
  };
}

export interface Route {
  path: Token[];
  hops: Hop[];
  amountIn: number;
  amountOut: number;
}

/**
 * Operation Types
 */
export interface SwapOperation {
  type: "swap";
  amount: number;
  tokenIn: Token;
  tokenOut: Token;
}

export interface LiquidityOperation {
  type: "addLiquidity" | "removeLiquidity";
  amount: number;
  vault: string;
}

export type Operation = SwapOperation | LiquidityOperation;

// Discovery Types
export interface TokenMetadata {
  name: string;
  description: string;
  image: string;
  identifier: string;
  symbol: string;
  decimals: number;
  total_supply?: string;
  token_uri?: string;
  image_uri?: string;
  image_thumbnail_uri?: string;
  image_canonical_uri?: string;
  tx_id?: string;
  sender_address?: string;
  contract_principal?: string;
  asset_identifier?: string;
  metadata?: {
    sip?: number;
    name?: string;
    description?: string;
    image?: string;
    cached_image?: string;
    cached_thumbnail_image?: string;
    attributes?: Array<{
      trait_type: string;
      display_type: string;
      value: string;
    }>;
    properties?: Record<string, string>;
    localization?: {
      uri: string;
      default: string;
      locales: string[];
    };
  };
  properties: {
    tokenAContract: string;
    tokenBContract: string;
    lpRebatePercent: number;
    externalPoolId?: string;
    engineContractId?: string;
  };
}

/**
 * Options Types
 */
export interface TransactionOptions {
  slippage?: number;
  stxAddress?: string;
  network?: StacksNetwork;
}

export interface SDKConfig {
  apiKey: string;
  apiKeys?: string[];
  apiKeyRotation?: "loop" | "random";
  privateKey: string;
  sponsored: boolean;
  sponsor: string;
  mode: string;
  network: 'mainnet' | 'testnet';
  proxy: string;
  ipfsGateway: string;
  stxAddress: string;
  defaultSlippage: number;
  maxHops: number;
  debug: boolean;
  preferredPools: string[];
  routerAddress: string;
  routerName: string;
  parallelRequests: number;
  retryDelay: number;
}

export interface ContractParams {
  tokenAContract: string;
  tokenBContract: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  lpRebatePercent: number;
  initialLiquidityA: number;
  initialLiquidityB: number;
}

export interface ExecuteOptions {
  disablePostConditions?: boolean;
  senderKey?: string;
  sponsored?: boolean;
  fee?: number;
  // Credential properties for flexible signing
  privateKey?: string;
  stxAddress?: string;
}

export interface PoolEvent {
  type: "swap" | "mint" | "burn";
  contract_id: string;
  block_height: number;
  tx_id: string;
  values: {
    [key: string]: any;
  };
}

/**
 * Error Types
 */
export interface DexterityError extends Error {
  code: number;
  details?: any;
}
