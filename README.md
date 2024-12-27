# Dexterity SDK

A TypeScript SDK for interacting with the Dexterity AMM protocol on Stacks. Dexterity uses an isolated vault system where each liquidity pool exists as an independent smart contract for enhanced security.

## Features

- 🔄 **Automated Market Making**

  - Direct token swaps
  - Multi-hop routing
  - Automated price discovery
  - Configurable fees

- 💧 **Liquidity Management**

  - Add/remove liquidity
  - Track reserves
  - Fair LP token distribution

- 🛡️ **Security First**

  - Isolated vault contracts
  - Post-condition checks
  - Slippage protection
  - Transaction preview

- 🔍 **Discovery & Analysis**
  - Automatic vault discovery
  - Route optimization
  - Price quotes
  - Debug utilities

## Installation

```bash
npm install dexterity-sdk
```

## Quick Start

```typescript
import { Dexterity } from "dexterity-sdk";
import { STACKS_MAINNET } from "@stacks/network";

// Initialize SDK with configuration
Dexterity.config = {
  mode: "server", // or "client" for browser environments
};

// Discover available pools
await Dexterity.discoverPools();

// Get a quote for a swap
const quote = await Dexterity.getQuote(
  "SP123.token-a", // token in
  "SP456.token-b", // token out
  1000000 // amount (in smallest units)
);

// Execute a swap (client mode)
await Dexterity.executeSwap("SP123.token-a", "SP456.token-b", 1000000);
```

## Core Concepts

### Environment Variables

```bash
# .env
STACKS_API_KEY="1975...f12c"
SEED_PHRASE="lunar fire amazing world ... big alcohol seven journey"
```

### Initialization

If providing seed phrase as an environment variable in a secure environment:

```typescript
await Dexterity.deriveSigner();
```

This will setup the sender key to sign and broadcast transactions.

### Configuration

The SDK can be configured for both client-side (browser) and server-side usage:

```typescript
// Client-side configuration
Dexterity.config = {
  mode: "client", // or "server" for non-browser environments
};

// Server-side configuration
Dexterity.config = {
  mode: "server",
  network: STACKS_MAINNET,
  apiKey: "HIRO_API_KEY",
};
```

Any configuration setting can be modified directly:

```typescript
Dexterity.config.mode = "client";

Dexterity.config.network = STACKS_TESTNET;

Dexterity.config.cache = CustomCache();
```

### Working with Vaults

Individual vaults represent liquidity pools and can be interacted with directly:

```typescript
// Get a specific vault
const vault = Dexterity.getVault("SP123.pool-contract");

// Get a quote from the vault
const quote = await vault.quote(
  1000000, // amount
  new Opcode().setOperation(OPERATION_TYPES.SWAP_A_TO_B)
);

// Build a transaction
const tx = await vault.buildTransaction(opcode, amount);
```

### Opcodes

Operations are configured using a flexible opcode system:

```typescript
import { Opcode, OPERATION_TYPES } from "dexterity-sdk";

// Create a swap A to B opcode
const opcode = new Opcode()
  .setOperation(OPERATION_TYPES.SWAP_A_TO_B)
  .setSwapType(SWAP_TYPES.EXACT_INPUT)
  .setFeeType(FEE_TYPES.REDUCE_INPUT);

// Preset operations available
const swapOpcode = Opcode.swapExactAForB();
const liquidityOpcode = Opcode.addBalancedLiquidity();
```

### Multi-Hop Routing

The SDK automatically finds optimal trading paths:

```typescript
// Get best route with quote
const quote = await Dexterity.getQuote(
  tokenInContract,
  tokenOutContract,
  amount
);

// Execute optimal route
await Dexterity.executeSwap(tokenInContract, tokenOutContract, amount);
```

## Contract Generation

The SDK includes utilities for generating new vault contracts:

```typescript
// Configure pool parameters
const tokenA = await Dexterity.getTokenInfo("SP123.token-a");
const tokenB = await Dexterity.getTokenInfo("SP123.token-b");
const poolConfig: LPToken = {
  contractId: "SP123.pool-token",
  name: "Token A-B Pool",
  symbol: "POOL-A-B",
  decimals: 6,
  fee: 3000, // 0.3%
  liquidity: [
    {
      ...tokenA, // swappable token A
      reserves: 1000000000, // initial liquidity A
    },
    {
      ...tokenB, // swappable token B
      reserves: 1000000000, // initial liquidity B
    },
  ],
};

// Generate contract
const contract = Dexterity.generateVaultContract(poolConfig);

// Deploy contract
const result = await ContractGenerator.deployContract(poolConfig, {
  senderKey: "your-private-key",
});
```

## Cache Configuration

The SDK includes a configurable caching layer that supports Charisma, in-memory, and custom cache providers:

```typescript
// Default Charisma cache
// No configuration needed - this is the default

// Using a custom cache provider
const customCache = new Dexterity.cacheProviders.CustomCache({
  get: async (key: string) => {
    // Your custom get logic
    return await yourCache.get(key);
  },
  set: async (key: string, value: any, ttlMs?: number) => {
    // Your custom set logic
    await yourCache.set(key, value, ttlMs);
  },
});

// Set the cache provider
Dexterity.cache = customCache;

// Example with Vercel KV
import { kv } from "@vercel/kv";

const kvCache = new Dexterity.cacheProviders.CustomCache({
  get: async (key) => await kv.get(key),
  set: async (key, value, ttlMs) => {
    const ttlSeconds = ttlMs ? Math.floor(ttlMs / 1000) : undefined;
    await kv.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
  },
});

Dexterity.cache = kvCache;
```

The cache is used to optimize common operations like token metadata retrieval and pool reserve queries. Custom cache providers can integrate with any storage system that supports basic get/set operations.

## Error Handling

The SDK uses a Result type for better error handling:

```typescript
// Using Result type
const quoteResult = await vault.quote(amount, opcode);
if (quoteResult.isErr()) {
  const error = quoteResult.unwrap();
  console.error(`Quote failed: ${error.message}`);
  return;
}
const quote = quoteResult.unwrap();

// Error codes
export const ERROR_CODES = {
  UNAUTHORIZED: 403,
  INVALID_OPERATION: 400,
  INSUFFICIENT_LIQUIDITY: 1001,
  EXCESSIVE_SLIPPAGE: 1003,
  QUOTE_FAILED: 1005,
  TRANSACTION_FAILED: 1006,
  // ... more error codes
};
```

## Debugging

The SDK includes comprehensive debugging utilities:

```typescript
import { debugUtils } from "dexterity-sdk";

// Enable debug mode
debugUtils.setDebugMode({
  enabled: true,
  logPathfinding: true,
  logQuotes: true,
  logEvaluation: true,
  verbosity: 2,
  callback: (info) => {
    console.log(`Debug [${info.phase}]:`, info.details);
  },
});

// Get debug stats
const stats = debugUtils.getStats();
```
