# Dexterity Protocol SDK

A complete TypeScript SDK for interacting with and deploying Vaults on Dexterity, a permissionless liquidity protocol. Each vault exists as an independent smart contract, providing enhanced security through isolation.

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
  - [Multi-hop Trading](#multi-hop-trading)
- [Contract Generation](#contract-generation)
  - [Configuration](#configuration)
  - [Deployment](#deployment)
- [Advanced Features](#advanced-features)
  - [Concentrated Liquidity](#concentrated-liquidity)
  - [Flash Loans](#flash-loans)
  - [Oracle Integration](#oracle-integration)
  - [Perpetual Positions](#perpetual-positions)
  - [Combined Strategies](#combined-strategies)
  - [Protocol Integration](#protocol-integration)
- [Error Handling](#error-handling)
- [Type System](#type-system)

## Features

- 🏗️ **Contract Generation**
  - Deploy independent vaults
  - Custom configuration
  - Built-in safety checks

- 💧 **Liquidity Management**
  - Add/remove positions
  - Track earnings
  - Collect fees

- 🔄 **Trading Operations**
  - Direct swaps
  - Multi-vault routing
  - Price quotes

- 🛡️ **Security First**
  - Atomic execution
  - Built-in slippage control
  - Independent vaults

## Installation

```bash
npm install @dexterity/sdk
```

## Quick Start

```typescript
import { DexteritySDK, Presets } from '@dexterity/sdk';

// Initialize SDK
const sdk = new DexteritySDK(network, stxAddress);

// Basic swap with 0.5% slippage protection
const swapTx = await sdk.buildSwapTransaction(
  vault,
  amount,
  Presets.standardSwap()  // Includes slippage control
);

// Execute with wallet
doContractCall(swapTx);
```

## Core Concepts

### Opcode System

All vault operations are configured through a flexible opcode system:

```typescript
// Basic swap with 0.5% slippage
const opcode = new OpcodeBuilder()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setSwapParams({
    slippageBps: 50,  // 0.5%
    deadline: 3600    // 1 hour timeout
  })
  .build();

// Advanced operations
const oracleSwap = new OpcodeBuilder()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setFeeType(FeeType.ORACLE)
  .setOracleParams({
    source: 1,    // Oracle source
    window: 3600  // Time window
  })
  .setSwapParams({
    slippageBps: 30  // 0.3% slippage
  })
  .build();
```

#### Common Presets

```typescript
// Pre-configured settings for common operations
const tx = await sdk.buildSwapTransaction(
  vault,
  amount,
  Presets.standardSwap()  // 0.5% slippage
);

// Other presets
Presets.conservativeSwap()  // 0.1% slippage
Presets.aggressiveSwap()    // 1.0% slippage
Presets.addLiquidity()      // Balanced liquidity add
```

### Transaction Safety

Every operation includes built-in safety mechanisms:

```typescript
// Slippage control through opcodes
const safeOpcode = new OpcodeBuilder()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setSwapParams({
    slippageBps: 50,    // 0.5% max slippage
    deadline: 3600      // 1 hour timeout
  })
  .build();

// Transaction automatically includes:
// 1. Input amount protection
// 2. Minimum output guarantee
// 3. Deadline checks
// 4. Vault authorization
```

### Route Optimization

Find optimal trading paths across multiple vaults:

```typescript
// Initialize routing graph
const graph = new DexterityGraph(sdk);
vaults.forEach(vault => graph.addEdge(vault));

// Find best route with custom parameters
const route = await graph.findBestRoute(
  tokenIn,
  tokenOut,
  amount,
  {
    maxHops: 3,
    maxImpact: 100,  // 1% max price impact
    gasOptimized: true
  }
);
```

## Vault Operations

### Swapping Tokens

```typescript
// Single-vault swap
const swapTx = await sdk.buildSwapTransaction(
  vault,
  amount,
  Presets.standardSwap()
);

// Multi-vault optimized swap
const multiTx = await sdk.buildMultiHopSwapTransaction(
  path,
  vaults,
  amount,
  route.opcodes  // Optimized opcodes per hop
);
```

### Managing Liquidity

```typescript
// Add balanced liquidity
const addTx = await sdk.buildAddLiquidityTransaction(
  vault,
  amount,
  Presets.addLiquidity()
);

// Remove liquidity
const removeTx = await sdk.buildRemoveLiquidityTransaction(
  vault,
  amount,
  Presets.removeLiquidity()
);
```

## Contract Generation

### Configuration

```typescript
const config: VaultConfig = {
  // Token configuration
  tokenA: {
    contractId: 'SP123...ABC.token-a',
    metadata: {
      symbol: 'TOKA',
      decimals: 6,
      name: 'Token A'
    }
  },
  tokenB: {
    contractId: '.stx',
    metadata: {
      symbol: 'STX',
      decimals: 6,
      name: 'Stacks Token'
    }
  },

  // Vault settings
  vaultName: 'Token A-STX Vault',
  vaultSymbol: 'vTOKA-STX',
  lpRebatePercent: 0.1,
  initialLiquidityA: 1000000,
  initialLiquidityB: 1000000,

  // Optional metadata
  description: 'Decentralized Liquidity Vault for Token A and STX',
  metadata: {
    website: 'https://example.com',
    logo: 'https://example.com/logo.png'
  }
};
```

### Deployment

```typescript
// Verify configuration
sdk.validateVaultConfig(config);

// Generate vault contract
const source = sdk.generateVaultContract(config);

// Deploy vault
const contractId = await sdk.deployVault(config);
```

## Advanced Features

### Concentrated Liquidity

Concentrated liquidity allows liquidity providers to allocate their capital within specific price ranges, increasing capital efficiency and potential returns. By focusing liquidity in narrower price bands, providers can earn more fees with less capital compared to traditional liquidity provision.

```typescript
const clOpcode = new OpcodeBuilder()
  .setOperation(OperationType.ADD_LIQUIDITY)
  .setLiquidityType(LiquidityType.CONCENTRATED)
  .setConcentratedParams({
    tickLower: -100,
    tickUpper: 100,
    fee: 30    // 0.3% fee tier
  })
  .build();
```

### Flash Loans

Use atomic vault operations for uncollateralized loans:

```typescript
// Configure flash loan operation
const flashLoanOp = new OpcodeBuilder()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setSwapType(SwapType.FLASH_LOAN)
  .setSwapParams({
    deadline: 3600,
    validateFn: 'SP2..ABC.validator'  // Callback contract
  })
  .build();

// Borrow and repay in single atomic transaction
const flashTx = await sdk.buildFlashSwapTransaction(
  vault,
  borrowAmount,
  flashLoanOp,
  {
    // Define repayment path
    repaymentVaults: [vault2, vault3],
    // Optional arbitrage parameters
    minProfit: 100_000
  }
);
```

### Oracle Integration

Integrate oracle data to enhance the accuracy and reliability of your transactions. This example demonstrates how to configure an oracle-based swap operation:

```typescript
const oracleOpcode = new OpcodeBuilder()
  .setOperation(OperationType.SWAP_A_TO_B)
  .setFeeType(FeeType.ORACLE)
  .setOracleParams({
    source: 1,     // Oracle source ID
    window: 3600,  // TWAP window
    flags: 0x01    // Use TWAP
  })
  .build();
```

### Perpetual Positions

Create synthetic perpetual positions using vault operations:

```typescript
// Open long position
const openLongOp = new OpcodeBuilder()
  .setOperation(OperationType.OPEN_POSITION)
  .setPositionType(PositionType.LONG)
  .setLeverageParams({
    leverage: 5,        // 5x leverage
    maxFundingRate: 100 // 1% max funding rate
  })
  .setOracleParams({
    source: 1,          // Price oracle
    window: 3600,       // TWAP window
    maxDeviation: 200   // 2% max deviation
  })
  .build();

// Execute opening transaction
const openTx = await sdk.buildPerpetualTransaction(
  vault,
  depositAmount,
  openLongOp
);

// Close position with take-profit
const closeLongOp = new OpcodeBuilder()
  .setOperation(OperationType.CLOSE_POSITION)
  .setPositionType(PositionType.LONG)
  .setTriggerParams({
    type: TriggerType.TAKE_PROFIT,
    price: entryPrice * 1.1  // 10% profit target
  })
  .build();

// Submit closing order
const closeTx = await sdk.buildPerpetualTransaction(
  vault,
  positionId,
  closeLongOp
);
```

### Combined Strategies

Create complex trading strategies by combining operations:

```typescript
// Open leveraged long with flash loan
const complexOp = new OpcodeBuilder()
  .setOperation(OperationType.MULTI_OP)
  .addOperation({
    type: OperationType.FLASH_LOAN,
    amount: borrowAmount,
    vault: lendingVault
  })
  .addOperation({
    type: OperationType.OPEN_POSITION,
    leverage: 3,
    vault: perpVault
  })
  .setRiskParams({
    maxSlippage: 50,    // 0.5% max slippage
    maxFunding: 100,    // 1% max funding
    timeout: 3600       // 1 hour timeout
  })
  .build();

// Execute complex strategy
const strategyTx = await sdk.buildStrategyTransaction(
  [lendingVault, perpVault],
  depositAmount,
  complexOp
);
```

### Protocol Integration

Use vaults as liquidity sources for other protocols:

```typescript
// Configure vault as lending pool
const lendingOp = new OpcodeBuilder()
  .setOperation(OperationType.LENDING_CONFIG)
  .setLendingParams({
    maxLTV: 7500,         // 75% max LTV
    liquidationThreshold: 8000,  // 80% liquidation
    borrowFee: 50,        // 0.5% borrow fee
    protocols: ['SP2..ABC.lending']  // Allowed protocols
  })
  .build();

// Initialize lending configuration
const lendingTx = await sdk.buildProtocolTransaction(
  vault,
  lendingOp
);

// Create lending market integration
const marketOp = new OpcodeBuilder()
  .setOperation(OperationType.MARKET_INTEGRATION)
  .setIntegrationParams({
    protocol: 'SP2..ABC.lending',
    fee: 10,  // 0.1% protocol fee
    withdrawLimit: 5000  // 50% max withdrawal
  })
  .build();
```

These examples demonstrate the flexibility of the opcode system in creating complex financial instruments. Each operation is atomic and includes built-in safety checks through the opcode parameters.

## Error Handling

```typescript
try {
  const tx = await sdk.buildSwapTransaction(
    vault, 
    amount,
    Presets.standardSwap()
  );
} catch (error) {
  if (error.code === ErrorCode.INSUFFICIENT_LIQUIDITY) {
    // Handle liquidity error
  } else if (error.code === ErrorCode.INVALID_OPERATION) {
    // Handle operation error
  }
}
```

## Type System

```typescript
interface Vault extends VaultToken {
  token0: Token;
  token1: Token;
  vaultData: VaultData;
  metadata: VaultMetadata;
}

interface Quote {
  dx: { value: number };  // Input amount
  dy: { value: number };  // Output amount
  dk: { value: number };  // Vault token amount
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [Documentation](https://docs.dexterity.org)
- [Discord](https://discord.gg/dexterity)
- [GitHub Issues](https://github.com/dexterity/sdk/issues)