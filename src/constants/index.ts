// src/constants/index.ts

export const ERROR_CODES = {
  // Authorization Errors (400-499)
  UNAUTHORIZED: 403,
  INVALID_OPERATION: 400,

  // Business Logic Errors (1000-1999)
  INSUFFICIENT_LIQUIDITY: 1001,
  INSUFFICIENT_BALANCE: 1002,
  EXCESSIVE_SLIPPAGE: 1003,
  INVALID_PATH: 1004,
  QUOTE_FAILED: 1005,
  TRANSACTION_FAILED: 1006,
  INVALID_OPCODE: 1007,
  NO_VALID_ROUTE: 1008,
  INVALID_CONFIG: 1009,
  DISCOVERY_FAILED: 1010,
  INVALID_CONTRACT: 1011,

  // System Errors (2000-2999)
  SDK_NOT_INITIALIZED: 2001,
  NETWORK_ERROR: 2002,
  CONTRACT_ERROR: 2003,
  NOT_IMPLEMENTED: 2004,
} as const;

export const PRECISION = {
  DECIMALS: 6,
  MULTIPLIER: 1_000_000, // 10^6
  MIN_AMOUNT: 1, // Minimum amount that can be processed
  MAX_AMOUNT: 1_000_000_000_000, // Maximum amount that can be processed
} as const;

export const OPERATION_TYPES = {
  SWAP_A_TO_B: 0x00,
  SWAP_B_TO_A: 0x01,
  ADD_LIQUIDITY: 0x02,
  REMOVE_LIQUIDITY: 0x03,
} as const;

export const FEE_TYPES = {
  REDUCE_INPUT: 0x00,
  REDUCE_OUTPUT: 0x01,
  BURN_ENERGY: 0x02,
} as const;

export const CONTRACT_DEFAULTS = {
  // ABI identifiers
  TRAITS: {
    SIP10:
      "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait",
    POOL: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dexterity-traits-v0.liquidity-pool-trait",
  },

  // Contract function names
  FUNCTIONS: {
    QUOTE: "quote",
    EXECUTE: "execute",
    GET_BALANCE: "get-balance",
    GET_NAME: "get-name",
    GET_SYMBOL: "get-symbol",
    GET_DECIMALS: "get-decimals",
  },

  // Default buffer sizes
  BUFFER_SIZES: {
    OPCODE: 16,
    TOKEN_URI: 256,
  },
} as const;

// Cache configuration
export const CACHE_CONFIG = {
  DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes in milliseconds
  QUOTES_TTL: 30 * 1000, // 30 seconds for quotes
  MAX_ITEMS: 1000, // Maximum number of items in cache
} as const;

// Discovery
export const DEFAULT_DISCOVERY_CONFIG = {
  startBlock: 0,
  batchSize: 50,
  parallelRequests: 5,
  refreshInterval: 30000, // 30 seconds
  cacheConfig: {
    ttl: 300000, // 5 minutes
    maxItems: 1000,
  },
} as const;

export const POOL_TRAIT = {
  maps: [],
  epoch: "Epoch30",
  functions: [
    {
      args: [
        {
          name: "amount",
          type: "uint128",
        },
        {
          name: "opcode",
          type: {
            optional: {
              buffer: {
                length: 16,
              },
            },
          },
        },
      ],
      name: "execute",
      access: "public",
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                {
                  name: "dk",
                  type: "uint128",
                },
                {
                  name: "dx",
                  type: "uint128",
                },
                {
                  name: "dy",
                  type: "uint128",
                },
              ],
            },
            error: "uint128",
          },
        },
      },
    },
    {
      args: [
        {
          name: "amount",
          type: "uint128",
        },
        {
          name: "opcode",
          type: {
            optional: {
              buffer: {
                length: 16,
              },
            },
          },
        },
      ],
      name: "quote",
      access: "read_only",
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                {
                  name: "dk",
                  type: "uint128",
                },
                {
                  name: "dx",
                  type: "uint128",
                },
                {
                  name: "dy",
                  type: "uint128",
                },
              ],
            },
            error: "uint128",
          },
        },
      },
    },
  ],
  variables: [],
  clarity_version: "Clarity3",
  fungible_tokens: [],
  non_fungible_tokens: [],
} as const;

export const TOKEN_FUNCTIONS = {
  GET_NAME: "get-name",
  GET_SYMBOL: "get-symbol",
  GET_DECIMALS: "get-decimals",
  GET_BALANCE: "get-balance",
  GET_TOKEN_URI: "get-token-uri",
} as const;

export const API_ENDPOINTS = {
  CONTRACT_BY_TRAIT: "/extended/v1/contract/by_trait",
  CONTRACT_CALL_READ: "/v2/contracts/call-read",
  ADDRESS_STX_BALANCE: "/extended/v1/address/{address}/stx",
  BLOCK_INFO: "/extended/v1/block",
} as const;
