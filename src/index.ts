// src/index.ts
import {
  contractPrincipalCV,
  Pc,
  PostConditionMode,
  uintCV,
  optionalCVOf,
  tupleCV,
  cvToValue,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { OpcodeBuilder, OperationType, Presets } from "./lib/opcode";
import type { Quote, LPToken, Token, TransactionConfig } from "./types";

export class DexteritySDK {
  private network: any;
  private stxAddress: string;

  constructor(network: any, stxAddress: string) {
    this.network = network;
    this.stxAddress = stxAddress;
  }

  /**
   * Quote Functions
   */
  async getQuote(
    pool: LPToken,
    amount: number,
    opcodeBuilder: OpcodeBuilder
  ): Promise<Quote> {
    const response = await fetchCallReadOnlyFunction({
      contractAddress: pool.contractId.split(".")[0],
      contractName: pool.contractId.split(".")[1],
      functionName: "quote",
      functionArgs: [
        uintCV(Math.floor(amount)),
        optionalCVOf(opcodeBuilder.build()),
      ],
      senderAddress: this.stxAddress,
      network: this.network,
    });

    return cvToValue(response).value as Quote;
  }

  /**
   * Swap Operations
   */
  async buildSwapTransaction(
    pool: LPToken,
    amount: number,
    opcodeBuilder: OpcodeBuilder = Presets.swapExactAForB(),
    slippagePercent: number = 0.5
  ): Promise<TransactionConfig> {
    const quote = await this.getQuote(pool, amount, opcodeBuilder);
    const slippage = 1 - slippagePercent / 100;

    // Determine from/to tokens based on operation type
    const isAToB = opcodeBuilder.getParameter(0) === OperationType.SWAP_A_TO_B;
    const fromToken = isAToB
      ? pool.liquidity[0].token
      : pool.liquidity[1].token;
    const toToken = isAToB ? pool.liquidity[1].token : pool.liquidity[0].token;

    const postConditions = [
      this.createPostCondition(fromToken, amount),
      this.createPostCondition(
        toToken,
        Math.floor(quote.dy.value * slippage),
        pool.contractId
      ),
    ];

    return {
      network: this.network,
      contractAddress: pool.contractId.split(".")[0],
      contractName: pool.contractId.split(".")[1],
      functionName: "execute",
      functionArgs: [uintCV(amount), optionalCVOf(opcodeBuilder.build())],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  /**
   * Liquidity Operations
   */
  async buildAddLiquidityTransaction(
    pool: LPToken,
    amount: number,
    opcodeBuilder: OpcodeBuilder = Presets.addBalancedLiquidity(),
    slippagePercent: number = 0.5
  ): Promise<TransactionConfig> {
    const quote = await this.getQuote(pool, amount, opcodeBuilder);
    const slippage = 1 + slippagePercent / 100;

    const postConditions = [
      this.createPostCondition(
        pool.liquidity[0].token,
        Math.ceil(quote.dx.value * slippage)
      ),
      this.createPostCondition(
        pool.liquidity[1].token,
        Math.ceil(quote.dy.value * slippage)
      ),
    ];

    return {
      network: this.network,
      contractAddress: pool.contractId.split(".")[0],
      contractName: pool.contractId.split(".")[1],
      functionName: "execute",
      functionArgs: [uintCV(amount), optionalCVOf(opcodeBuilder.build())],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  async buildRemoveLiquidityTransaction(
    pool: LPToken,
    amount: number,
    opcodeBuilder: OpcodeBuilder = Presets.removeLiquidity(),
    slippagePercent: number = 0.5
  ): Promise<TransactionConfig> {
    const quote = await this.getQuote(pool, amount, opcodeBuilder);
    const slippage = 1 - slippagePercent / 100;

    const postConditions = [
      this.createPostCondition(pool, amount),
      this.createPostCondition(
        pool.liquidity[0].token,
        Math.floor(quote.dx.value * slippage),
        pool.contractId
      ),
      this.createPostCondition(
        pool.liquidity[1].token,
        Math.floor(quote.dy.value * slippage),
        pool.contractId
      ),
    ];

    return {
      network: this.network,
      contractAddress: pool.contractId.split(".")[0],
      contractName: pool.contractId.split(".")[1],
      functionName: "execute",
      functionArgs: [uintCV(amount), optionalCVOf(opcodeBuilder.build())],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  /**
   * Multi-hop Operations
   */

  async buildMultiHopSwapTransaction(
    path: Token[],
    pools: LPToken[],
    amount: number,
    opcodes: OpcodeBuilder[] = [],
    slippagePercent: number = 0.5
  ): Promise<TransactionConfig> {
    // If no custom opcodes provided, create default ones
    if (opcodes.length === 0) {
      opcodes = pools.map((pool, i) => {
        const fromToken = path[i];
        const isAToB =
          pool.liquidity[0].token.contractId === fromToken.contractId;
        return isAToB ? Presets.swapExactAForB() : Presets.swapExactBForA();
      });
    }

    // Ensure we have the correct number of opcodes
    if (opcodes.length !== pools.length) {
      throw new Error("Number of opcodes must match number of pools");
    }

    // Create hop tuples
    const hops = pools.map((pool, i) => {
      return tupleCV({
        pool: contractPrincipalCV(
          pool.contractId.split(".")[0],
          pool.contractId.split(".")[1]
        ),
        opcode: optionalCVOf(opcodes[i].build()),
      });
    });

    // Get quotes for proper post conditions
    let currentAmount = amount;
    const quotes: Quote[] = [];

    for (let i = 0; i < pools.length; i++) {
      const quote = await this.getQuote(pools[i], currentAmount, opcodes[i]);
      quotes.push(quote);
      currentAmount = quote.dy.value;
    }

    // Create post conditions with slippage protection
    const slippage = 1 - slippagePercent / 100;
    const postConditions = pools.map((pool, i) => {
      const fromToken = path[i];
      const toToken = path[i + 1];
      const quote = quotes[i];

      if (i === 0) {
        // First hop: sender sends input token
        return this.createPostCondition(fromToken, amount);
      } else {
        // Other hops: pool sends output token with slippage protection
        return this.createPostCondition(
          toToken,
          Math.floor(quote.dy.value * slippage),
          pool.contractId
        );
      }
    });

    return {
      network: this.network,
      contractAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
      contractName: "multihop",
      functionName: `swap-${path.length - 1}`,
      functionArgs: [uintCV(amount), ...hops],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  /**
   * Helper Methods
   */
  private createPostCondition(
    token: Token,
    amount: number,
    sender: string = this.stxAddress
  ) {
    // Handle STX transfers
    if (token.contractId === ".stx") {
      return Pc.principal(sender).willSendEq(amount).ustx();
    }

    // For SIP10 tokens
    else {
      return Pc.principal(sender)
        .willSendEq(amount)
        .ft(token.contractId as any, token.identifier);
    }
  }
}

// Opcode functionality
export {
  OpcodeBuilder,
  OperationType,
  SwapType,
  FeeType,
  LiquidityType,
  Presets,
} from "./lib/opcode";

// Graph functionality
export {
  DexterityGraph,
  type GraphNode,
  type GraphEdge,
  type EdgeData,
  type Route,
  type RouteHop,
} from "./lib/graph";

// Contract generation
export { ContractGenerator } from "./lib/generator";

// Type exports
export type {
  Token,
  LPToken,
  Quote,
  SwapQuote,
  LiquidityQuote,
  TransactionConfig,
  SwapConfig,
  LiquidityConfig,
  MultiHopConfig,
  SDKConfig,
  RouterConfig,
  DexterityResponse,
  DexterityError,
} from "./types";

/**
 * Usage Examples
 */

/*
// Initialize SDK
const sdk = new DexteritySDK(network, stxAddress);

// Basic Swap
const swapTx = await sdk.buildSwapTransaction(
  pool,
  amount,
  Presets.swapExactAForB()
);

// Oracle-based Swap
const oracleSwapTx = await sdk.buildSwapTransaction(
  pool,
  amount,
  new OpcodeBuilder()
    .setOperation(OperationType.SWAP_A_TO_B)
    .setFeeType(FeeType.ORACLE)
    .setOracleParams({
      source: 1,
      window: 3600
    })
);

// Add Concentrated Liquidity
const addLiqTx = await sdk.buildAddLiquidityTransaction(
  pool,
  amount,
  new OpcodeBuilder()
    .setOperation(OperationType.ADD_LIQUIDITY)
    .setLiquidityType(LiquidityType.BALANCED)
    .setConcentratedLiquidity({
      tickLower: -100,
      tickUpper: 100
    })
);

// Multi-hop Swap with Custom Opcodes
const multiHopTx = await sdk.buildMultiHopSwapTransaction(
  path,
  pools,
  amount,
  [
    Presets.swapExactAForB(),
    new OpcodeBuilder()
      .setOperation(OperationType.SWAP_B_TO_A)
      .setFeeType(FeeType.REDUCED)
  ]
);

// Execute with wallet
doContractCall(swapTx);
*/
