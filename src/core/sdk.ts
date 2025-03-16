import "dotenv/config";
import { Router } from "./router";
import { Vault } from "./vault";
import {
  POOL_TRAIT,
} from "../utils/constants";
import type {
  Token,
  SDKConfig,
  ExecuteOptions,
  ContractId,
} from "../types";
import { StacksClient } from "../utils/client";
import { loadConfig, DEFAULT_SDK_CONFIG } from "../utils/config";
import { Cache } from "../utils/cache";
import {
  deploySubnetWrapper,
  SubnetWrapperParams,
  DeploymentResult,
  generateSubnetWrapper
} from "./token-wrapper";

export class Dexterity {
  static config = DEFAULT_SDK_CONFIG;
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
  static async discover({
    blacklist = [],
    serialize = false,
    load = true,
    reserves = true,
    continueOnError = true
  }: {
    blacklist?: ContractId[],
    serialize?: boolean,
    load?: boolean,
    reserves?: boolean,
    continueOnError?: boolean
  } = {}): Promise<Partial<Vault>[]> {
    // Ensure config is loaded
    await this.configure();

    // Search for contracts with the POOL_TRAIT
    const contracts = await Dexterity.client.searchContractsByTrait(
      POOL_TRAIT,
    );

    // Filter out blacklisted contracts
    const filteredContracts = contracts.filter(
      (contract) => !blacklist.includes(contract.contract_id)
    );

    console.log(`Discovered ${filteredContracts.length} potential pools`);

    // Process contracts in parallel batches
    const vaults: Vault[] = [];
    const parallelRequests = Dexterity.config.parallelRequests;
    const failedPools: { contractId: string, error: any }[] = [];

    for (let i = 0; i < filteredContracts.length; i += parallelRequests) {
      const batch = filteredContracts.slice(i, i + parallelRequests);

      // Use allSettled to handle failures gracefully
      const batchResults = await Promise.allSettled(
        batch.map(contract => Vault.build(contract.contract_id, reserves))
      );

      // Process results, handling both successes and failures
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const contractId = batch[j].contract_id;

        if (result.status === 'fulfilled' && result.value !== null) {
          vaults.push(result.value);
        } else {
          // Record the failure
          const error = result.status === 'rejected' ? result.reason : 'Null vault returned';
          failedPools.push({ contractId, error });
          console.warn(`Failed to build vault for ${contractId}: ${error}`);

          // If we're not continuing on error, throw
          if (!continueOnError) {
            throw new Error(`Failed to build vault for ${contractId}: ${error}`);
          }
        }
      }
    }

    // Log a summary of failed pools
    if (failedPools.length > 0) {
      console.warn(`Failed to load ${failedPools.length} pools out of ${filteredContracts.length}`);
    }

    console.log(`Successfully loaded ${vaults.length} vaults`);

    // Load vaults into router if requested
    if (load) this.router.loadVaults(vaults);

    // Return vaults in requested format
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

  /**
   * Deploy a subnet wrapper contract for an existing token
   * @param params Subnet wrapper parameters
   * @param credentials Optional credentials override (privateKey, stxAddress)
   * @returns Promise resolving to the deployment result
   */
  static async deployTokenSubnet(
    params: SubnetWrapperParams,
    credentials?: { privateKey?: string; stxAddress?: string }
  ): Promise<DeploymentResult> {
    // Ensure SDK is configured
    await this.configure();

    try {
      // Deploy the subnet wrapper contract with optional credentials
      const result = await deploySubnetWrapper(params, credentials);

      // Return the deployment result
      return result;
    } catch (error) {
      // Handle any errors
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error deploying token subnet"
      };
    }
  }

  /**
   * Generate subnet wrapper contract code without deploying
   * @param params Subnet wrapper parameters
   * @param address Optional STX address override for contractId
   * @returns Contract code, name, and ID
   */
  static generateSubnetCode(params: SubnetWrapperParams) {
    // Generate and return the contract code and metadata
    return {
      code: generateSubnetWrapper(params),
      contractName: params.versionName
    }
  }
}
