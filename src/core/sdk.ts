import "dotenv/config";
import { Result, Cache, ErrorUtils, deriveSigner } from "../utils";
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
  Route,
  Quote,
  SDKConfig,
  ExecuteOptions,
  ContractId,
} from "../types";
import { StacksClient } from "../utils/client";
import { DEFAULT_SDK_CONFIG, validateConfig } from "../config";
import { ContractGenerator } from "./generator";

export class Dexterity {
  static cache: Cache = Cache.getInstance();
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
    await deriveSigner();

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
   * Get current configuration
   */
  static getConfig(): SDKConfig {
    return this.config;
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
    contractId: ContractId
  ): Promise<Result<LPToken, Error>> {
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
      const pool = {
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
      };
      return Result.ok(pool);
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

        const [identifier, symbol, decimals, name, metadata] =
          await Promise.all([
            StacksClient.getTokenIdentifier(contractId),
            StacksClient.getTokenSymbol(contractId),
            StacksClient.getTokenDecimals(contractId),
            StacksClient.getTokenName(contractId),
            StacksClient.getTokenMetadata(contractId).catch(() => null),
          ]);

        return {
          contractId,
          identifier,
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
    tokenInContract: ContractId,
    tokenOutContract: ContractId,
    amount: number
  ) {
    const routeResult = await this.router.findBestRoute(
      tokenInContract,
      tokenOutContract,
      amount
    );
    const route = routeResult.unwrap();
    return this.router.buildRouterTransaction(route, amount);
  }

  /**
   * Execute a swap between two tokens
   */
  static async executeSwap(
    tokenInContract: ContractId,
    tokenOutContract: ContractId,
    amount: number,
    options?: ExecuteOptions
  ) {
    // 1. Find the best route
    const routeResult = await this.router.findBestRoute(
      tokenInContract,
      tokenOutContract,
      amount
    );
    const route = routeResult.unwrap();

    // 4. Execute the route
    const txResult = await this.router.executeSwap(route, amount, options);
    return txResult;
  }

  static async getQuote(
    tokenInContract: ContractId,
    tokenOutContract: ContractId,
    amount: number
  ) {
    const cacheKey = `quote:${tokenInContract}:${tokenOutContract}:${amount}`;

    return await this.cache.getOrSet(
      cacheKey,
      async () => {
        const routeResult = await this.router.findBestRoute(
          tokenInContract,
          tokenOutContract,
          amount
        );

        if (routeResult.isErr()) throw routeResult.unwrap();
        const route = routeResult.unwrap();

        return {
          route,
          amountIn: route.amountIn,
          amountOut: route.amountOut,
          expectedPrice: route.amountOut / route.amountIn,
          minimumReceived: route.amountOut,
          fee: route.totalFees,
        };
      },
      30000 // 30 second cache for quotes
    );
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

  /**
   * Get all swappable tokens
   */
  static getTokens() {
    // Use a Map to deduplicate tokens
    const tokens = new Map<string, Token>();
    // Collect unique tokens from all liquidity pairs
    for (const pool of this.router.vaults.values()) {
      const liquidity = pool.getTokens();
      for (const token of liquidity) {
        if (token.contractId) {
          tokens.set(token.contractId, {
            contractId: token.contractId,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            identifier: token.identifier,
            description: token.description,
            image: token.image,
          });
        }
      }
    }
    return Array.from(tokens.values());
  }

  /**
   * Contract generation methods
   */
  static generateVaultContract(config: LPToken): ContractGenerator {
    return ContractGenerator.generateVaultContract(config);
  }
}
