import "dotenv/config";
import { Result, ErrorUtils } from "../utils";
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
  SDKConfig,
  ExecuteOptions,
  ContractId,
  CacheProvider,
} from "../types";
import { StacksClient } from "../utils/client";
import { DEFAULT_SDK_CONFIG } from "../config";
import { ContractGenerator } from "./generator";
import {
  generateNewAccount,
  generateWallet,
  getStxAddress,
} from "@stacks/wallet-sdk";
import { CharismaCache } from "../utils/cache/charisma";
import { CustomCache } from "../utils/cache/custom";
import { MemoryCache } from "../utils/cache/memory";

export class Dexterity {
  static config = DEFAULT_SDK_CONFIG;
  static cache: CacheProvider = new CharismaCache();
  static codegen = ContractGenerator;
  static client = StacksClient;
  static router = Router;
  static cacheProviders = {
    CharismaCache,
    CustomCache,
    MemoryCache,
  };

  /**
   * Get current configuration
   */
  static getConfig(): SDKConfig {
    return this.config;
  }

  /**
   * Discovery Methods
   */
  static async discoverPools(limit?: number) {
    const contracts = await this.client.searchContractsByTrait(
      POOL_TRAIT,
      limit
    );

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
      pools.push(...(results.filter((pool) => pool !== null) as LPToken[]));
    }

    const vaults = pools.map((pool) => new Vault(pool));
    this.router.loadVaults(vaults);
    return pools;
  }

  static async processPoolContract(
    contractId: ContractId
  ): Promise<LPToken | null> {
    try {
      const metadata = await this.client.getTokenMetadata(contractId);
      if (!metadata.properties) {
        throw new Error("Invalid pool metadata");
      }
      const supply = await this.client.getTotalSupply(contractId);
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
        supply,
      };
      return pool;
    } catch (error) {
      console.error(`\nError processing pool contract: ${contractId}`);
      return null;
    }
  }

  /**
   * Token Information Methods
   */
  static async getTokenInfo(contractId: string): Promise<Token> {
    const cacheKey = `token:${contractId}`;

    return this.cache.getOrSet(cacheKey, async () => {
      try {
        if (contractId === ".stx") {
          return {
            contractId: ".stx",
            identifier: "STX",
            name: "Stacks Token",
            symbol: "STX",
            decimals: 6,
            description: "The native token of the Stacks blockchain",
            image: "https://charisma.rocks/stx-logo.png",
          } as Token;
        }

        const [identifier, symbol, decimals, name, metadata] =
          await Promise.all([
            this.client.getTokenIdentifier(contractId),
            this.client.getTokenSymbol(contractId),
            this.client.getTokenDecimals(contractId),
            this.client.getTokenName(contractId),
            this.client
              .getTokenMetadata(contractId)
              .catch(() => ({ description: "", image: "" })),
          ]);

        const token: Token = {
          contractId: contractId as ContractId,
          identifier,
          name,
          symbol,
          decimals,
          description: metadata?.description || "",
          image: metadata?.image || "",
        };

        return token;
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
          ? this.client.getStxBalance(contractAddress)
          : this.client.getTokenBalance(token0Contract, poolContract),
        token1Contract === ".stx"
          ? this.client.getStxBalance(contractAddress)
          : this.client.getTokenBalance(token1Contract, poolContract),
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

  static async deriveSigner(index = 0) {
    if (process.env.SEED_PHRASE) {
      // using a blank password since wallet isn't persisted
      const password = "";
      // create a Stacks wallet with the mnemonic
      let wallet = await generateWallet({
        secretKey: process.env.SEED_PHRASE,
        password: password,
      });
      // add a new account to reach the selected index
      for (let i = 0; i <= index; i++) {
        wallet = generateNewAccount(wallet);
      }
      // return address and key for selected index
      const stxAddress = getStxAddress(
        wallet.accounts[index],
        this.config.network
      );

      this.config.mode = "server";
      this.config.privateKey = wallet.accounts[index].stxPrivateKey;
      this.config.stxAddress = stxAddress;
    } else {
      this.config.mode = "client";
    }
  }
}
