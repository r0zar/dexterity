import "dotenv/config";
import { DexterityGraph, Route, GraphConfig } from "./lib/graph";
import { discoverVaults, type ContractSearchParams } from "./lib/search";
import { Opcode, Presets } from "./lib/opcode";
import type { Token, TransactionConfig, SDKConfig, LPToken } from "./types";

interface SwapOptions {
  slippagePercent?: number;
  maxHops?: number;
  customPath?: string[];
  deadline?: number;
}

interface LiquidityOptions {
  slippagePercent?: number;
  deadline?: number;
}

export class DexteritySDK {
  private network: any;
  private stxAddress: string;
  private graph: DexterityGraph | null = null;
  private defaultSlippage: number;

  constructor(config: SDKConfig) {
    this.network = config.network;
    this.stxAddress = config.stxAddress;
    this.defaultSlippage = config.defaultSlippage || 0.5;
  }

  /**
   * Initialization
   */
  async initialize(
    searchParams?: ContractSearchParams,
    graphConfig?: GraphConfig
  ): Promise<void> {
    // Discover vaults
    const { vaults } = await discoverVaults(
      this.network,
      this.defaultSlippage,
      searchParams
    );

    // Initialize graph with discovered vaults
    this.graph = await DexterityGraph.fromVaults(vaults, graphConfig);
  }

  /**
   * Core Trading Functions
   */
  async buildSwap(
    amount: number,
    tokenInId: string,
    tokenOutId: string,
    options: SwapOptions = {}
  ): Promise<TransactionConfig> {
    this.checkInitialization();

    // Get tokens from graph
    const tokenIn = await this.getTokenInfo(tokenInId);
    const tokenOut = await this.getTokenInfo(tokenOutId);

    // If custom path provided, validate and use it
    if (options.customPath) {
      return this.buildCustomPathSwap(amount, options.customPath, options);
    }

    // Find best route
    const route = await this.graph!.findBestRoute(
      tokenIn,
      tokenOut,
      amount,
      this.stxAddress
    );

    if (!route) {
      throw new Error(`No route found from ${tokenInId} to ${tokenOutId}`);
    }

    return this.buildRouteTransaction(route, amount, options);
  }

  /**
   * Liquidity Management
   */
  async buildAddLiquidity(
    poolId: string,
    amount: number,
    options: LiquidityOptions = {}
  ): Promise<TransactionConfig> {
    this.checkInitialization();

    const vault = this.graph!.getVault(poolId);
    if (!vault) {
      throw new Error(`Pool ${poolId} not found`);
    }

    return vault.buildTransaction(
      this.stxAddress,
      amount,
      Presets.addBalancedLiquidity(),
      options.slippagePercent ?? this.defaultSlippage
    );
  }

  async buildRemoveLiquidity(
    poolId: string,
    amount: number,
    options: LiquidityOptions = {}
  ): Promise<TransactionConfig> {
    this.checkInitialization();

    const vault = this.graph!.getVault(poolId);
    if (!vault) {
      throw new Error(`Pool ${poolId} not found`);
    }

    return vault.buildTransaction(
      this.stxAddress,
      amount,
      Presets.removeLiquidity(),
      options.slippagePercent ?? this.defaultSlippage
    );
  }

  /**
   * Helper Methods
   */
  async getTokenInfo(contractId: string): Promise<Token> {
    this.checkInitialization();
    const token = this.graph!.getToken(contractId);
    if (!token) {
      throw new Error(`Token ${contractId} not found in graph`);
    }
    return token;
  }

  getVault(poolId: string): any {
    this.checkInitialization();
    const vault = this.graph!.getVault(poolId);
    if (!vault) {
      throw new Error(`Pool ${poolId} not found in graph`);
    }
    return vault;
  }

  /**
   * Private Helper Methods
   */
  private async buildRouteTransaction(
    route: Route,
    amount: number,
    options: SwapOptions
  ): Promise<TransactionConfig> {
    // For single hop swaps, use the vault directly
    if (route.hops.length === 1) {
      const hop = route.hops[0];
      const isAToB =
        hop.tokenIn.contractId === hop.pool.liquidity[0].token.contractId;
      const opcode = isAToB
        ? Presets.swapExactAForB()
        : Presets.swapExactBForA();

      return hop.vault.buildTransaction(
        this.stxAddress,
        amount,
        opcode,
        options.slippagePercent ?? this.defaultSlippage
      );
    }

    // For multi-hop swaps, build a multi-hop transaction
    const hops = route.hops.map((hop) => ({
      vault: hop.vault,
      opcode:
        hop.tokenIn.contractId === hop.pool.liquidity[0].token.contractId
          ? Presets.swapExactAForB()
          : Presets.swapExactBForA(),
    }));

    return this.buildMultiHopTransaction(
      route.path,
      hops,
      amount,
      options.slippagePercent ?? this.defaultSlippage
    );
  }

  private async buildCustomPathSwap(
    amount: number,
    path: string[],
    options: SwapOptions
  ): Promise<TransactionConfig> {
    // Validate each token exists in the graph
    const tokens = await Promise.all(path.map((id) => this.getTokenInfo(id)));
    const route = await this.validateAndBuildRoute(tokens, amount);

    if (!route) {
      throw new Error("Invalid custom path - no valid route found");
    }

    return this.buildRouteTransaction(route, amount, options);
  }

  private async validateAndBuildRoute(
    tokens: Token[],
    amount: number
  ): Promise<Route | null> {
    this.checkInitialization();

    if (tokens.length < 2) {
      throw new Error("Path must contain at least 2 tokens");
    }

    // Find route through specified path
    return this.graph!.findBestRoute(
      tokens[0],
      tokens[tokens.length - 1],
      amount,
      this.stxAddress
    );
  }

  private async buildMultiHopTransaction(
    path: Token[],
    hops: { vault: any; opcode: Opcode }[],
    amount: number,
    slippagePercent: number
  ): Promise<TransactionConfig> {
    // Implementation to be added
    throw new Error("Multi-hop transactions not implemented");
  }

  private checkInitialization() {
    if (!this.graph) {
      throw new Error("SDK not initialized. Call initialize() first.");
    }
  }

  /**
   * Public Utility Methods
   */
  isInitialized(): boolean {
    return this.graph !== null;
  }

  /**
   * Gets all available tokens in the graph
   */
  getAllTokens(): Token[] {
    this.checkInitialization();
    return this.graph!.getTokens();
  }

  /**
   * Gets all available pools in the graph
   */
  getAllPools(): LPToken[] {
    this.checkInitialization();
    return this.graph!.getPools();
  }

  /**
   * Gets pools that contain a specific token
   */
  getPoolsForToken(tokenId: string): LPToken[] {
    this.checkInitialization();
    return this.graph!.getPoolsForToken(tokenId);
  }

  /**
   * Gets the underlying graph object
   */
  getGraph(): DexterityGraph {
    this.checkInitialization();
    return this.graph!;
  }

  /**
   * Gets a quote for a swap
   */
  async getQuote(
    tokenInId: string,
    tokenOutId: string,
    amount: number,
    options: SwapOptions = {}
  ): Promise<{ route: Route; quote: any }> {
    this.checkInitialization();

    const tokenIn = await this.getTokenInfo(tokenInId);
    const tokenOut = await this.getTokenInfo(tokenOutId);

    const route = await this.graph!.findBestRoute(
      tokenIn,
      tokenOut,
      amount,
      this.stxAddress
    );

    if (!route) {
      throw new Error(`No route found from ${tokenInId} to ${tokenOutId}`);
    }

    return {
      route,
      quote: {
        amountIn: amount,
        amountOut: route.expectedOutput,
        priceImpact: route.priceImpact,
        path: route.path.map((token) => token.contractId),
      },
    };
  }
}

// Export types and utilities
export type {
  Token,
  TransactionConfig,
  SDKConfig,
  SwapOptions,
  LiquidityOptions,
  ContractSearchParams,
  GraphConfig,
};
