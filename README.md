# Dexterity Protocol SDK

A complete TypeScript SDK for interacting with Vaults on Dexterity, a permissionless liquidity protocol. Each vault exists as an independent smart contract, providing enhanced security through isolation.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Opcode System](#opcode-system)
  - [Transaction Safety](#transaction-safety)
  - [Route Optimization](#route-optimization)
- [Vault Operations](#vault-operations)
  - [Swapping Tokens](#swapping-tokens)
  - [Managing Liquidity](#managing-liquidity)
- [Contract Generation](#contract-generation)
  - [Configuration](#configuration)
  - [Deployment](#deployment)
- [Error Handling](#error-handling)
- [Type System](#type-system)

## Features

- 🔍 **Discovery**

  - Automatic vault discovery
  - Network scanning
  - Metadata caching

- 💱 **Trading**

  - Direct swaps
  - Multi-hop routing
  - Price quotes

- 💧 **Liquidity Management**

  - Add/remove positions
  - Track reserves
  - Fee management

- 🛡️ **Security First**
  - Post conditions
  - Slippage protection
  - Independent vaults

## Installation

```bash
npm install dexterity-sdk
```

## Quick Start

```typescript
import { DexteritySDK } from "dexterity-sdk";

// Initialize SDK
const sdk = new DexteritySDK({
  network: network,
  stxAddress: stxAddress,
  defaultSlippage: 0.5,
});

// Initialize by discovering vaults
await sdk.initialize();

// Get a specific vault from the graph
const vault = sdk.getVaultForPool("SP123...ABC.pool-token");

// Build a transaction directly on the vault
const tx = await vault.buildTransaction(
  sdk.stxAddress, // sender
  1000000, // amount
  Presets.swapExactAForB(),
  0.5 // slippage percent
);

// Execute with wallet
doContractCall(tx);

// Or use high-level SDK methods for automatic routing
const swapTx = await sdk.buildSwap(amount, tokenInId, tokenOutId, {
  slippagePercent: 0.5,
  maxHops: 3,
});
```

## Core Concepts

### Working with Vaults

After initializing the SDK, you can work with individual vaults or use the high-level SDK methods:

```typescript
// Get information about available pools
const pools = sdk.getAllPools();
const tokensInPool = sdk.getPoolsForToken(tokenId);

// Get a specific vault to work with
const vault = sdk.getVaultForPool(poolId);

// Build transactions directly on the vault
const tx = await vault.buildTransaction(
  sender,
  amount,
  opcode, // We'll cover opcodes in the next section
  slippagePercent
);

// Or use SDK convenience methods that handle routing
const swapTx = await sdk.buildSwap(amount, tokenInId, tokenOutId);
```

### Opcode System

All vault operations are configured through a flexible opcode system:

```typescript
import { Opcode, OperationType, SwapType, FeeType } from "dexterity-sdk";

// Basic swap configuration
const opcode = new Opcode()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setSwapType(SwapType.EXACT_INPUT)
  .setFeeType(FeeType.REDUCE_INPUT)
  .build();

// Common presets available
Presets.swapExactAForB();
Presets.swapExactBForA();
Presets.addBalancedLiquidity();
Presets.removeLiquidity();
```

### Transaction Safety

Every operation includes built-in safety mechanisms:

```typescript
// Transaction automatically includes:
// 1. Post conditions for token transfers
// 2. Slippage protection
// 3. Principal checks
// 4. Fee calculations

const tx = await vault.buildTransaction(
  sender,
  amount,
  opcode,
  slippagePercent
);

// Execute with wallet
doContractCall(tx);
```

### Route Optimization

Find optimal trading paths across multiple vaults:

```typescript
// Initialize SDK with routing config
const sdk = new DexteritySDK({
  network,
  stxAddress,
  defaultSlippage: 0.5,
});

// Find best route
const { route, quote } = await sdk.getQuote(tokenInId, tokenOutId, amount, {
  maxHops: 3,
  slippagePercent: 0.5,
});
```

## Vault Operations

### Swapping Tokens

```typescript
// Basic swap
const swapTx = await sdk.buildSwap(amount, tokenInId, tokenOutId, {
  slippagePercent: 0.5,
});

// Custom path swap
const customSwapTx = await sdk.buildSwap(amount, tokenInId, tokenOutId, {
  customPath: [token1Id, token2Id, token3Id],
  slippagePercent: 0.5,
});
```

### Managing Liquidity

```typescript
// Add liquidity
const addTx = await sdk.buildAddLiquidity(poolId, amount, {
  slippagePercent: 0.5,
});

// Remove liquidity
const removeTx = await sdk.buildRemoveLiquidity(poolId, amount, {
  slippagePercent: 0.5,
});
```

## Contract Generation

### Configuration

```typescript
const config: LPToken = {
  contractId: "SP123...ABC.pool-token",
  name: "Token A-STX Pool",
  symbol: "POOL-A-STX",
  decimals: 6,
  identifier: "token-id",
  fee: 3000, // 0.3% fee
  liquidity: [
    {
      token: tokenA,
      reserves: 1000000,
    },
    {
      token: tokenB,
      reserves: 1000000,
    },
  ],
};
```

### Deployment

```typescript
import { ContractGenerator } from "dexterity-sdk";

// Generate vault contract
const source = ContractGenerator.generateVaultContract(config);

// Deploy contract
const contractId = await ContractGenerator.deployPoolContract(
  config,
  network,
  senderAddress
);
```

## Error Handling

```typescript
try {
  const tx = await sdk.buildSwap(amount, tokenInId, tokenOutId, {
    slippagePercent: 0.5,
  });
} catch (error) {
  if (error instanceof DexterityError) {
    // Handle specific error types
    switch (error.code) {
      case ErrorCode.INSUFFICIENT_LIQUIDITY:
        // Handle liquidity error
        break;
      case ErrorCode.EXCESSIVE_SLIPPAGE:
        // Handle slippage error
        break;
    }
  }
}
```

## Type System

```typescript
interface Token {
  contractId: string;
  identifier: string;
  name: string;
  symbol: string;
  decimals: number;
  supply?: number;
  image?: string;
  description?: string;
}

interface LPToken extends Token {
  liquidity: Liquidity[];
  fee: number;
}

interface Quote {
  dx: number; // Input amount
  dy: number; // Output amount
  dk: number; // LP token amount
}
```

## License

MIT License - see [LICENSE](LICENSE) for details.
