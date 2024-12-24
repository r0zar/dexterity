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
  network: STACKS_MAINNET,
  mode: "client", // or "server" for non-browser environments
  apiKey: "YOUR_HIRO_API_KEY",
  defaultSlippage: 0.5,
  maxHops: 3,
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

### Configuration

The SDK can be configured for both client-side (browser) and server-side usage:

```typescript
// Client-side configuration
Dexterity.config = {
  mode: "client",
  network: STACKS_MAINNET,
  apiKey: "YOUR_HIRO_API_KEY",
  proxy: "https://your-api-proxy.com",
  defaultSlippage: 0.5,
  maxHops: 3,
};

// Server-side configuration
Dexterity.config = {
  mode: "server",
  network: STACKS_MAINNET,
  privateKey: "your-private-key",
  apiKey: "YOUR_HIRO_API_KEY",
  stxAddress: "your-stx-address",
};
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
const poolConfig: LPToken = {
  contractId: "SP123.pool-token",
  name: "Token A-B Pool",
  symbol: "POOL-A-B",
  decimals: 6,
  fee: 3000, // 0.3%
  liquidity: [
    {
      contractId: "SP123.token-a",
      identifier: "token-a",
      name: "Token A",
      symbol: "TA",
      decimals: 6,
      reserves: 1000000000,
    },
    {
      contractId: "SP456.token-b",
      identifier: "token-b",
      name: "Token B",
      symbol: "TB",
      decimals: 6,
      reserves: 1000000000,
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
