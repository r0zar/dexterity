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

// export interface TransactionConfig {
//   network: StacksNetwork;
//   contractAddress: string;
//   contractName: string;
//   functionName: string;
//   functionArgs: any[];
//   postConditionMode: PostConditionMode;
//   postConditions: any[];
//   onFinish?: (data: any) => void;
//   onCancel?: () => void;
// }

/**
 * Route Types
 */
export interface RouteHop {
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
  hops: RouteHop[];
  amountIn: number;
  amountOut: number;
  totalFees: number;
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
  properties?: {
    contractName: `${string}.${string}`;
    tokenAContract: string;
    tokenBContract: string;
    lpRebatePercent: number;
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

export interface CacheConfig {
  ttl: number;
  maxItems: number;
}

export interface CacheConfig {
  ttl: number;
  maxItems: number;
}

export interface SDKConfig {
  apiKey: string;
  privateKey: string;
  mode: string;
  network: StacksNetwork;
  stxAddress: string;
  defaultSlippage: number;
  maxHops: number;
  preferredPools: string[];
  routerAddress: string;
  routerName: string;
  minimumLiquidity: number;
  discovery: {
    startBlock?: number;
    batchSize?: number;
    parallelRequests?: number;
    refreshInterval?: number;
    cacheConfig?: CacheConfig;
  };
}

export interface ContractParams {
  tokenUri: string;
  tokenAContract: string;
  tokenBContract: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  lpRebatePercent: number;
  initialLiquidityA: number;
  initialLiquidityB: number;
}

export interface DeployOptions {
  senderKey: string;
  fee?: number;
}

export interface ExecuteOptions {
  senderKey?: string;
  fee?: number;
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

/**
 * Response Types
 */
export interface OperationResponse<T> {
  success: boolean;
  data?: T;
  error?: DexterityError;
}
