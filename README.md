# Dexterity SDK

![Dexterity Banner](https://github.com/r0zar/dexterity/blob/main/github-banner.png)

A TypeScript SDK and CLI for interacting with the Dexterity AMM protocol on Stacks. Dexterity uses an isolated vault system where each liquidity pool exists as an independent smart contract for enhanced security.

[![npm version](https://badge.fury.io/js/dexterity-sdk.svg)](https://badge.fury.io/js/dexterity-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start
```bash
npm install dexterity-sdk
```

```typescript
import { Dexterity } from "dexterity-sdk";

// Get a quote for swapping tokens
const quote = await Dexterity.getQuote(
  "SP123.token-a",  // token in
  "SP456.token-b",  // token out
  1000000          // amount (in smallest units)
);

// Execute the swap (client mode)
await Dexterity.executeSwap(
  "SP123.token-a", 
  "SP456.token-b", 
  1000000
);
```

## Features

- 🔄 **Advanced Trading**
  - Direct token swaps
  - Multi-hop routing with automatic path finding
  - Price quotes and analysis
  - Automated price discovery
  - Configurable fees and slippage protection

- 💧 **Liquidity Management**
  - Add/remove liquidity
  - Track reserves across pools
  - Fair LP token distribution
  - Balanced and imbalanced deposits

- 🛡️ **Enterprise Security**
  - Isolated vault contracts
  - Post-condition checks
  - Transaction preview
  - API key rotation
  - Rate limiting protection

- 🔍 **Discovery & Analysis**
  - Automatic vault discovery
  - Route optimization
  - Debug utilities
  - Testing utilities

## Core Concepts

### Environment Setup

Create a `.env` file in your project root:

```bash
# .env
STACKS_API_KEY="your-api-key"  # Required for higher rate limits
SEED_PHRASE="..."              # Optional: Only for server environments
```

### Configuration

The SDK supports both client-side (browser) and server-side usage:

```typescript
// Client-side (browser)
Dexterity.configure({
  mode: "client",
  network: 'testnet',
});

// Server-side
Dexterity.configure({
  mode: "server",
  network: 'mainnet,
  apiKey: process.env.HIRO_API_KEY,
});
```

Any configuration can be modified:

```typescript
// Update individual settings
Dexterity.configure({ maxHops: 3 });
Dexterity.configure({ defaultSlippage: 0.5 });

// Get current config
const config = Dexterity.config
```

### Working with Quotes

Get quotes for potential trades:

```typescript
// Simple quote
const quote = await Dexterity.getQuote(
  tokenInContract,
  tokenOutContract,
  amount
);

console.log({
  amountIn: quote.amountIn,
  amountOut: quote.amountOut,
  expectedPrice: quote.expectedPrice,
  minimumReceived: quote.minimumReceived,
  fee: quote.fee
});

// Execute the quoted trade
await Dexterity.executeSwap(
  tokenInContract, 
  tokenOutContract, 
  amount,
  { fee: 10000 } // optional parameters
);
```

### Pool Operations

Interact with individual liquidity pools:

```typescript
// Get a specific pool
const vault = Dexterity.build("SP123.pool-abc");

// Get pool information
const [tokenA, tokenB] = vault.getTokens();
const [reserveA, reserveB] = vault.getReserves();

// Get a quote from the pool
const quote = await vault.quote(
  1000000,
  Opcode.swapExactAForB()
);
```

## CLI Usage

The SDK includes a powerful CLI for interacting with the protocol:

```bash
# Install globally
npm install -g dexterity-sdk

# Get a quote
dexterity quote .stx SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token 1000000

# List all pools
dexterity vaults

# Show debug information
dexterity -d inspect -g
```

### CLI Configuration

Manage CLI settings:

```bash
# View config
dexterity config ls

# Set values
dexterity config set maxHops 3
dexterity config set defaultSlippage 0.5

# Reset to defaults
dexterity config reset
```

### Inspection Commands

Analyze protocol components:

```bash
# Inspect a pool
dexterity inspect -v SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token

# Analyze token routes
dexterity inspect -r .stx SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token

# Show routing statistics
dexterity inspect -g
```

## Development

### Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage
```

### Building

```bash
# Clean and build
npm run clean && npm run build

# Development
npm run dev
```

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -am 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
