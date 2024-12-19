// src/types.ts
import { PostConditionMode } from "@stacks/transactions";

/**
 * Core Entity Types
 */

export interface Token {
  contractId: string;
  metadata: {
    symbol: string;
    name: string;
    decimals: number;
    identifier?: string; // SIP-010 token identifier
    images?: {
      logo?: string;
    };
  };
}

// Interface for SIP-010 compliant LP tokens
export interface LPToken {
  contractId: string;
  metadata: {
    symbol: string;
    name: string;
    decimals: number;
    identifier: string; // Required for LP tokens
  };
}

export interface Pool extends LPToken {
  token0: Token;
  token1: Token;
  poolData: {
    reserve0: number;
    reserve1: number;
    totalSupply: number;
    fee: number;
  };
  metadata: {
    symbol: string;
    name: string;
    decimals: number;
    identifier: string; // LP token identifier is required for pools
    description?: string;
    image?: string;
  };
}

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  identifier?: string; // SIP-010 token identifier
  images?: {
    logo?: string;
  };
}

export interface PoolMetadata {
  name: string;
  symbol: string;
  identifier: string; // LP token identifier
  description?: string;
  image?: string;
}

export interface PoolData {
  reserve0: number;
  reserve1: number;
  totalSupply: number;
  fee: number;
}

/**
 * Quote Types
 */

export interface BaseQuote {
  dx: { value: number }; // Input amount
  dy: { value: number }; // Output amount
  dk: { value: number }; // LP token amount (where applicable)
}

export interface SwapQuote extends BaseQuote {
  priceImpact?: number;
  minimumReceived?: number;
  fee?: number;
}

export interface LiquidityQuote extends BaseQuote {
  share?: number; // Share of pool after operation
  fees?: {
    token0: number;
    token1: number;
  };
}

export type Quote = SwapQuote | LiquidityQuote;

/**
 * Transaction Types
 */

export interface TransactionConfig {
  network: any;
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: any[];
  postConditionMode: PostConditionMode;
  postConditions: any[];
  onFinish?: (data: any) => void;
  onCancel?: () => void;
}

export interface PostCondition {
  principal: string;
  amount: number;
  token?: Token;
  conditionCode: "send-eq" | "send-lte" | "send-gte";
}

/**
 * Operation Configuration Types
 */

export interface SwapConfig {
  pool: Pool;
  amount: number;
  slippagePercent?: number;
  deadline?: number;
  referrer?: string;
}

export interface LiquidityConfig {
  pool: Pool;
  amount: number;
  slippagePercent?: number;
  deadline?: number;
  singleSided?: boolean;
}

export interface MultiHopConfig {
  path: Token[];
  pools: Pool[];
  amount: number;
  slippagePercent?: number;
  deadline?: number;
}

/**
 * Event Types
 */

export interface SwapEvent {
  pool: string;
  sender: string;
  recipient: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  timestamp: number;
}

export interface LiquidityEvent {
  pool: string;
  provider: string;
  token0Amount: number;
  token1Amount: number;
  lpTokenAmount: number;
  timestamp: number;
}

/**
 * Error Types
 */

export interface DexterityError extends Error {
  code: number;
  details?: any;
}

export enum ErrorCode {
  INSUFFICIENT_LIQUIDITY = 1001,
  INSUFFICIENT_BALANCE = 1002,
  EXCESSIVE_SLIPPAGE = 1003,
  INVALID_PATH = 1004,
  QUOTE_FAILED = 1005,
  TRANSACTION_FAILED = 1006,
  INVALID_OPCODE = 1007,
}

/**
 * Configuration Types
 */

export interface SDKConfig {
  network: any;
  stxAddress: string;
  defaultSlippage?: number;
  defaultDeadline?: number;
  referralAddress?: string;
}

export interface RouterConfig {
  maxHops?: number;
  maxSplits?: number;
  excludePools?: string[];
  preferredPools?: string[];
}

/**
 * Response Types
 */

export interface PoolResponse {
  success: boolean;
  pool?: Pool;
  error?: DexterityError;
}

export interface QuoteResponse {
  success: boolean;
  quote?: Quote;
  error?: DexterityError;
}

export interface TransactionResponse {
  success: boolean;
  txId?: string;
  error?: DexterityError;
}

export type DexterityResponse =
  | PoolResponse
  | QuoteResponse
  | TransactionResponse;
