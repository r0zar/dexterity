import "dotenv/config";
import { Router } from "./router";
import { Vault } from "./vault";
import {
  POOL_TRAIT,
} from "../utils/constants";
import type {
  LPToken,
  Token,
  SDKConfig,
  ExecuteOptions,
  ContractId,
} from "../types";
import { StacksClient } from "../utils/client";
import { loadConfig, DEFAULT_SDK_CONFIG } from "../utils/config";
import { ContractGenerator } from "./generator";
import { Cache } from "../utils/cache";

export class Dexterity {
  static config = DEFAULT_SDK_CONFIG;
  static codegen = ContractGenerator;
  static client = StacksClient.getInstance();
  static router = Router;

  /**
   * Set SDK configuration
   * @param config Partial configuration object
   */
  static async configure(config?: Partial<SDKConfig>): Promise<void> {
    // Load and validate config using loadConfig utility
    this.config = await loadConfig(config);
  }

  /**
   * Discover vaults and load them into the router
   */
  static async discover({blacklist = [], serialize = false, load = true, reserves = true}: {blacklist?: ContractId[], serialize?: boolean, load?: boolean, reserves?: boolean} = {}): Promise<Partial<Vault>[]> {
    const contracts = await Dexterity.client.searchContractsByTrait(
      POOL_TRAIT,
      50 // limit
    );
    
    // Filter out blacklisted contracts
    const filteredContracts = contracts.filter(
      (contract) => !blacklist.includes(contract.contract_id)
    );

    // Process contracts in parallel batches
    const vaults: Vault[] = [];
    const parallelRequests = Dexterity.config.parallelRequests;

    for (let i = 0; i < filteredContracts.length; i += parallelRequests) {
      const batch = filteredContracts.slice(i, i + parallelRequests);
      const vaultPromises = batch.map((contract) =>
        Vault.build(contract.contract_id, reserves)
      );

      const results = await Promise.all(vaultPromises);
      vaults.push(...(results.filter((vault) => vault !== null) as Vault[]));
    }

    if (load) this.router.loadVaults(vaults);
    return serialize ? vaults.map(v => v.toLPToken()) : vaults;
  }
  
  /**
   * Token Information Methods
   */
  static async getTokenInfo(contractId: string): Promise<Token> {
    return Cache.getOrSet(`token:${contractId}`, async () => {
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

  /**
   * Core trading methods
   */
  static async buildSwap(
    tokenInContract: ContractId,
    tokenOutContract: ContractId,
    amount: number
  ) {
    const route = await this.router.findBestRoute(
      tokenInContract,
      tokenOutContract,
      amount
    );
    if (route instanceof Error) throw route;
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
    const route = await this.router.findBestRoute(
      tokenInContract,
      tokenOutContract,
      amount
    );
    if (route instanceof Error) throw route;
    // 4. Execute the route
    const txResult = await this.router.executeSwap(route, amount, options);
    return txResult;
  }

  /**
   * Get a quote for a swap between two tokens
   */
  static async getQuote(
    tokenInContract: ContractId,
    tokenOutContract: ContractId,
    amount: number
  ) {
    return await Cache.getOrSet(
      `quote:${tokenInContract}:${tokenOutContract}:${amount}`,
      async () => {
        const route = await this.router.findBestRoute(
          tokenInContract,
          tokenOutContract,
          amount
        );
        if (route instanceof Error) throw route;

        return {
          route,
          amountIn: route.amountIn,
          amountOut: route.amountOut,
          expectedPrice: route.amountOut / route.amountIn,
          minimumReceived: route.amountOut
        };
      },
      30000 // 30 second cache for quotes
    );
  }

  /**
   * Vault management methods
   */
  static getVault(vaultId: string): Vault | undefined {
    return this.router.edges.get(vaultId);
  }

  static getVaults(): Vault[] {
    return this.router.getVaults();
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
    for (const pool of this.router.edges.values()) {
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
}
