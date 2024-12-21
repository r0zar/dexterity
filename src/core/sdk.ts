import { Result, Cache, ErrorUtils } from "../utils";
import { Router } from "./router";
import { Vault } from "./vault";
import {
  DEFAULT_DISCOVERY_CONFIG,
  ERROR_CODES,
  POOL_TRAIT,
} from "../constants";
import type {
  LPToken,
  Token,
  TransactionConfig,
  Route,
  Quote,
  SDKConfig,
} from "../types";
import { StacksClient } from "../utils/client";
import { DEFAULT_SDK_CONFIG, validateConfig } from "../config";

export class Dexterity {
  static cache: Cache;
  static config: SDKConfig = DEFAULT_SDK_CONFIG;
  static client: typeof StacksClient = StacksClient;
  static router: typeof Router = Router;

  /**
   * Initialization with discovered pools
   */
  static async initialize(
    config?: SDKConfig
  ): Promise<Result<LPToken[] | void, Error>> {
    this.config = validateConfig(config);
    this.cache = Cache.getInstance();

    try {
      const poolsResult = await this.discoverPools();
      if (poolsResult.isErr()) {
        console.error("Failed to discover pools:", poolsResult);
      }

      const pools = poolsResult.unwrap();
      const vaults = pools.map((pool) => new Vault(pool));
      this.router.loadVaults(vaults);

      return Result.ok(void 0);
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.SDK_NOT_INITIALIZED,
          "Failed to initialize SDK",
          error
        )
      );
    }
  }

  /**
   * Check if SDK is properly initialized
   */
  static isInitialized(): boolean {
    return this.router !== null;
  }

  /**
   * Get current configuration
   */
  static getConfig(): SDKConfig {
    return { ...this.config };
  }

  /**
   * Discovery Methods
   */
  static async discoverPools(): Promise<Result<LPToken[], Error>> {
    try {
      const contracts = await StacksClient.searchContractsByTrait(POOL_TRAIT);

      if (!contracts.length) {
        return Result.err(
          ErrorUtils.createError(
            ERROR_CODES.DISCOVERY_FAILED,
            "No pool contracts found"
          )
        );
      }

      // Process contracts in parallel batches
      const pools: LPToken[] = [];
      const parallelRequests =
        this.config.discovery?.parallelRequests ??
        DEFAULT_DISCOVERY_CONFIG.parallelRequests;

      for (let i = 0; i < contracts.length; i += parallelRequests) {
        const batch = contracts.slice(i, i + parallelRequests);
        const poolPromises = batch.map((contract) =>
          this.processPoolContract(contract.contract_id)
        );

        const results = await Promise.all(poolPromises);
        pools.push(...results.filter((r) => r.isOk()).map((r) => r.unwrap()));
      }

      return Result.ok(pools);
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.DISCOVERY_FAILED,
          "Failed to discover pools",
          error
        )
      );
    }
  }

  private static async processPoolContract(
    contractId: `${string}.${string}`
  ): Promise<Result<LPToken, Error>> {
    console.log(`Processing contract ${contractId}`);
    try {
      const metadata = await this.client.getTokenMetadata(contractId);

      if (!metadata.properties) {
        return Result.err(
          ErrorUtils.createError(
            ERROR_CODES.INVALID_CONTRACT,
            `No properties found in metadata for ${contractId}`
          )
        );
      }

      const [token0, token1] = await Promise.all([
        this.getTokenInfo(metadata.properties.tokenAContract),
        this.getTokenInfo(metadata.properties.tokenBContract),
      ]);

      const [reserve0, reserve1] = await this.getPoolReserves(
        contractId,
        metadata.properties.tokenAContract,
        metadata.properties.tokenBContract
      );

      const fee = Math.floor(
        (metadata.properties.lpRebatePercent / 100) * 1000000
      );

      return Result.ok({
        contractId,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        identifier: metadata.identifier,
        description: metadata.description,
        image: metadata.image,
        fee,
        liquidity: [
          { ...token0, reserves: reserve0 },
          { ...token1, reserves: reserve1 },
        ],
        supply: 0,
      });
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.DISCOVERY_FAILED,
          `Failed to process contract ${contractId}`,
          error
        )
      );
    }
  }

  /**
   * Token Information Methods
   */
  static async getTokenInfo(contractId: string): Promise<Token> {
    const cacheKey = `token:${contractId}`;

    return Dexterity.cache.getOrSet(cacheKey, async () => {
      try {
        if (contractId === ".stx") {
          return {
            contractId: ".stx",
            identifier: "STX",
            name: "Stacks Token",
            symbol: "STX",
            decimals: 6,
          } as Token;
        }

        const [symbol, decimals, name, metadata] = await Promise.all([
          StacksClient.getTokenSymbol(contractId),
          StacksClient.getTokenDecimals(contractId),
          StacksClient.getTokenName(contractId),
          StacksClient.getTokenMetadata(contractId).catch(() => null),
        ]);

        return {
          contractId,
          identifier: symbol,
          name,
          symbol,
          decimals,
          description: metadata?.description,
          image: metadata?.image,
        } as Token;
      } catch (error) {
        console.error(`Error fetching token info for ${contractId}:`, error);
        throw error;
      }
    });
  }

  static async getPoolReserves(
    poolContract: string,
    token0Contract: string,
    token1Contract: string
  ): Promise<[number, number]> {
    const cacheKey = `reserves:${poolContract}:${token0Contract}:${token1Contract}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const [contractAddress] = poolContract.split(".");

      return Promise.all([
        token0Contract === ".stx"
          ? StacksClient.getStxBalance(contractAddress)
          : StacksClient.getTokenBalance(token0Contract, poolContract),
        token1Contract === ".stx"
          ? StacksClient.getStxBalance(contractAddress)
          : StacksClient.getTokenBalance(token1Contract, poolContract),
      ]);
    });
  }

  /**
   * Core trading methods
   */
  static async buildSwap(
    tokenIn: Token,
    tokenOut: Token,
    amount: number
  ): Promise<Result<TransactionConfig | Route | Quote | number, Error>> {
    if (!this.isInitialized()) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.SDK_NOT_INITIALIZED,
          "SDK not initialized"
        )
      );
    }

    try {
      // 1. Get best route
      const routeResult = await this.router.findBestRoute(
        tokenIn,
        tokenOut,
        amount
      );
      if (routeResult.isErr()) return routeResult;
      const route = routeResult.unwrap();

      // 2. If single hop, delegate to the Vault
      if (route.hops.length === 1) {
        const hop = route.hops[0];
        // We already know direction if we built the opcode,
        // but here's an example of using a preset if you prefer:
        const opcode = hop.opcode;
        return hop.vault.buildTransaction(opcode, amount);
      }

      // 3. If multi-hop, build a router transaction
      return this.router.buildRouterTransaction(route, amount);
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.TRANSACTION_FAILED,
          "Failed to build swap transaction",
          error
        )
      );
    }
  }

  static async getQuote(
    tokenIn: Token,
    tokenOut: Token,
    amount: number
  ): Promise<Result<Quote | Route, Error>> {
    if (!this.isInitialized()) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.SDK_NOT_INITIALIZED,
          "SDK not initialized"
        )
      );
    }

    const cacheKey = `quote:${tokenIn.contractId}:${tokenOut.contractId}:${amount}`;

    try {
      return await this.cache.getOrSet(
        cacheKey,
        async () => {
          const routeResult = await this.router.findBestRoute(
            tokenIn,
            tokenOut,
            amount
          );

          if (routeResult.isErr()) return routeResult;
          const route = routeResult.unwrap();

          return Result.ok({
            amountIn: route.amountIn,
            amountOut: route.amountOut,
            expectedPrice: route.amountOut / route.amountIn,
            minimumReceived:
              route.amountOut * (1 - this.config.defaultSlippage! / 100),
            fee: route.totalFees,
          });
        },
        30000 // 30 second cache for quotes
      );
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.QUOTE_FAILED,
          "Failed to get quote",
          error
        )
      );
    }
  }

  /**
   * Vault management methods
   */
  static getVault(vaultId: string): Vault | undefined {
    return this.router.vaults.get(vaultId);
  }

  static getAllVaults(): Map<string, Vault> {
    return this.router.vaults;
  }

  static getVaultsForToken(tokenId: string): Map<string, Vault> {
    return this.router.getVaultsForToken(tokenId);
  }
}
