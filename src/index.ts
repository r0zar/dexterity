import "dotenv/config";
import { discoverVaults, type ContractSearchParams } from "./lib/search";
import { Presets } from "./lib/opcode";
import { TradeEngine, type EngineConfig } from "./lib/engine";
import type { Token, TransactionConfig, SDKConfig } from "./types";

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
  private engine: TradeEngine | null = null;
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
    engineConfig?: Partial<EngineConfig>
  ): Promise<TradeEngine> {
    const { vaults } = await discoverVaults(
      this.network,
      this.defaultSlippage,
      searchParams
    );

    this.engine = await TradeEngine.fromVaults(vaults, {
      network: this.network,
      defaultSlippage: this.defaultSlippage,
      ...engineConfig,
    });
    return this.engine;
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

    const tokenIn = await this.getTokenInfo(tokenInId);
    const tokenOut = await this.getTokenInfo(tokenOutId);

    if (options.customPath) {
      const tokens = await Promise.all(
        options.customPath.map((id) => this.getTokenInfo(id))
      );

      if (tokens.length < 2) {
        throw new Error("Path must contain at least 2 tokens");
      }

      if (
        tokens[0].contractId !== tokenIn.contractId ||
        tokens[tokens.length - 1].contractId !== tokenOut.contractId
      ) {
        throw new Error(
          "Custom path must start with tokenIn and end with tokenOut"
        );
      }
    }

    return this.engine!.buildTrade(tokenIn, tokenOut, amount, this.stxAddress, {
      slippage: options.slippagePercent,
      maxHops: options.maxHops,
    });
  }

  /**
   * Liquidity Management
   */
  async buildAddLiquidity(
    vaultId: string,
    amount: number,
    options: LiquidityOptions = {}
  ): Promise<TransactionConfig> {
    this.checkInitialization();

    const vault = this.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    return vault.buildTransaction(
      this.stxAddress,
      amount,
      Presets.addBalancedLiquidity(),
      options.slippagePercent ?? this.defaultSlippage
    );
  }

  async buildRemoveLiquidity(
    vaultId: string,
    amount: number,
    options: LiquidityOptions = {}
  ): Promise<TransactionConfig> {
    this.checkInitialization();

    const vault = this.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    return vault.buildTransaction(
      this.stxAddress,
      amount,
      Presets.removeLiquidity(),
      options.slippagePercent ?? this.defaultSlippage
    );
  }

  /**
   * Token Methods
   */
  async getTokenInfo(contractId: string): Promise<Token> {
    this.checkInitialization();
    const token = this.engine!.getToken(contractId);
    if (!token) {
      throw new Error(`Token ${contractId} not found`);
    }
    return token;
  }

  getAllTokens(): Token[] {
    this.checkInitialization();
    return this.engine!.getAllTokens();
  }

  /**
   * Vault Methods
   */
  getVault(vaultId: string): any {
    this.checkInitialization();
    const vault = this.engine!.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }
    return vault;
  }

  getAllVaults(): any[] {
    this.checkInitialization();
    return this.engine!.getAllVaults();
  }

  getVaultsForToken(tokenId: string): any[] {
    this.checkInitialization();
    return this.engine!.getVaultsForToken(tokenId);
  }

  /**
   * Quote Methods
   */
  async getQuote(
    tokenInId: string,
    tokenOutId: string,
    amount: number,
    options: SwapOptions = {}
  ): Promise<{ route: any; quote: any }> {
    this.checkInitialization();

    const tokenIn = await this.getTokenInfo(tokenInId);
    const tokenOut = await this.getTokenInfo(tokenOutId);

    const route = await this.engine!.findBestRoute(
      tokenIn,
      tokenOut,
      amount,
      this.stxAddress,
      options.maxHops
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

  /**
   * Utility Methods
   */
  isInitialized(): boolean {
    return this.engine !== null;
  }

  private checkInitialization() {
    if (!this.engine) {
      throw new Error("SDK not initialized. Call initialize() first.");
    }
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
  EngineConfig,
};
