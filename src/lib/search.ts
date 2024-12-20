import { StacksNetwork } from "@stacks/network";
import { createClient } from "@stacks/blockchain-api-client";
import {
  cvToValue,
  hexToCV,
  cvToJSON,
  parseToCV,
  cvToHex,
} from "@stacks/transactions";
import { Vault } from "./vault";
import type { LPToken, Token } from "../types";

export interface ContractSearchParams {
  network?: StacksNetwork;
  limit?: number;
  offset?: number;
  excludePools?: string[];
}

export interface SearchResult {
  vaults: Map<string, Vault>;
  pools: LPToken[];
}

interface TokenMetadata {
  name: string;
  description: string;
  image: string;
  identifier: string;
  symbol: string;
  decimals: number;
  properties?: {
    contractName: string;
    tokenAContract: string;
    tokenBContract: string;
    lpRebatePercent: number;
  };
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

class APICache {
  private cache: Map<string, CacheEntry<any>>;
  private ttl: number; // Time to live in milliseconds

  constructor(ttlMinutes: number = 5) {
    this.cache = new Map();
    this.ttl = ttlMinutes * 60 * 1000;
  }

  generateKey(functionName: string, ...args: any[]): string {
    return `${functionName}:${JSON.stringify(args)}`;
  }

  async getOrSet<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.ttl) {
      return cached.value;
    }

    const value = await fetchFn();
    this.cache.set(key, { value, timestamp: now });
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}

// Create a singleton cache instance
const cache = new APICache();

// Export cache control functions
export const cacheControl = {
  clear: () => cache.clear(),
  invalidate: (key: string) => cache.invalidate(key),
};

async function createStacksClient(network: StacksNetwork) {
  const client = createClient({
    baseUrl: network.client.baseUrl,
  });

  if (process.env.STACKS_API_KEY || process.env.HIRO_API_KEY) {
    client.use({
      onRequest({ request }) {
        request.headers.set(
          "x-hiro-api-key",
          String(process.env.STACKS_API_KEY || process.env.HIRO_API_KEY)
        );
        return request;
      },
    });
  }

  return client;
}

/**
 * Gets token metadata from the contract's token-uri endpoint
 */
async function getTokenMetadata(
  client: any,
  contract: string
): Promise<TokenMetadata> {
  const cacheKey = cache.generateKey("getTokenMetadata", contract);
  return cache.getOrSet(cacheKey, async () => {
    const [address, name] = contract.split(".");
    const path = `/v2/contracts/call-read/${address}/${name}/get-token-uri`;
    const contractResponse = await client.POST(path, {
      body: { sender: address, arguments: [] },
    });

    // Parse the token URI from the response
    const url = cvToJSON(hexToCV(contractResponse.data.result))?.value?.value
      ?.value;
    if (!url) throw new Error("No token URI found");

    // Fetch and return the metadata
    const webResponse = await fetch(url);
    const metadata = await webResponse.json();
    return metadata;
  });
}

/**
 * Gets the token identifier from the contract
 */
async function getTokenIdentifier(
  client: any,
  contractId: string
): Promise<string> {
  const cacheKey = cache.generateKey("getTokenIdentifier", contractId);
  return cache.getOrSet(cacheKey, async () => {
    const [address, name] = contractId.split(".");
    const path = `/v2/contracts/call-read/${address}/${name}/get-symbol`;
    const response = await client.POST(path, {
      body: { sender: address, arguments: [] },
    });
    return String(cvToValue(hexToCV(response.data.result)).value);
  });
}

/**
 * Gets the token symbol from the contract
 */
async function getTokenSymbol(
  client: any,
  contractId: string
): Promise<string> {
  const cacheKey = cache.generateKey("getTokenSymbol", contractId);
  return cache.getOrSet(cacheKey, async () => {
    const [address, name] = contractId.split(".");
    const path = `/v2/contracts/call-read/${address}/${name}/get-symbol`;
    const response = await client.POST(path, {
      body: { sender: address, arguments: [] },
    });
    return String(cvToValue(hexToCV(response.data.result)).value);
  });
}

/**
 * Gets the token decimals from the contract
 */
async function getTokenDecimals(
  client: any,
  contractId: string
): Promise<number> {
  const cacheKey = cache.generateKey("getTokenDecimals", contractId);
  return cache.getOrSet(cacheKey, async () => {
    const [address, name] = contractId.split(".");
    const path = `/v2/contracts/call-read/${address}/${name}/get-decimals`;
    const response = await client.POST(path, {
      body: { sender: address, arguments: [] },
    });
    return Number(cvToValue(cvToValue(hexToCV(response.data.result))));
  });
}

/**
 * Gets the token name from the contract
 */
async function getTokenName(client: any, contractId: string): Promise<string> {
  const cacheKey = cache.generateKey("getTokenName", contractId);
  return cache.getOrSet(cacheKey, async () => {
    const [address, name] = contractId.split(".");
    const path = `/v2/contracts/call-read/${address}/${name}/get-name`;
    const response = await client.POST(path, {
      body: { sender: address, arguments: [] },
    });
    return String(cvToValue(hexToCV(response.data.result)).value);
  });
}

/**
 * Gets metadata for a token contract by combining on-chain data with metadata
 */
async function getTokenInfo(client: any, contractId: string): Promise<Token> {
  const cacheKey = cache.generateKey("getTokenInfo", contractId);
  return cache.getOrSet(cacheKey, async () => {
    try {
      // Get on-chain data
      const identifier = await getTokenIdentifier(client, contractId);
      const symbol = await getTokenSymbol(client, contractId);
      const decimals = await getTokenDecimals(client, contractId);
      const name = await getTokenName(client, contractId);

      // Get optional metadata
      let description = undefined;
      let image = undefined;

      try {
        const metadata = await getTokenMetadata(client, contractId);
        description = metadata.description;
        image = metadata.image;
      } catch (error) {
        console.warn(
          `Failed to fetch metadata for ${contractId}, continuing with basic info`
        );
      }

      return {
        contractId,
        identifier,
        name,
        symbol,
        decimals,
        description,
        image,
      };
    } catch (error) {
      console.error(`Error fetching token info for ${contractId}:`, error);
      throw error;
    }
  });
}

/**
 * Gets token balance for a specific contract and holder
 */
async function getTokenBalance(
  client: any,
  tokenContract: string,
  holderContract: string
): Promise<number> {
  const cacheKey = cache.generateKey(
    "getTokenBalance",
    tokenContract,
    holderContract
  );
  return cache.getOrSet(cacheKey, async () => {
    try {
      const [address, name] = tokenContract.split(".");
      const path = `/v2/contracts/call-read/${address}/${name}/get-balance`;

      const response = await client.POST(path, {
        body: {
          sender: address,
          arguments: [cvToHex(parseToCV(holderContract, "principal"))],
        },
      });

      return Number(cvToValue(cvToValue(hexToCV(response.data.result))));
    } catch (error) {
      console.warn(
        `Error fetching balance for ${tokenContract} of ${holderContract}:`,
        error
      );
      return 0;
    }
  });
}

/**
 * Gets STX balance for a contract address
 */
async function getStxBalance(client: any, address: string): Promise<number> {
  const cacheKey = cache.generateKey("getStxBalance", address);
  return cache.getOrSet(cacheKey, async () => {
    try {
      const response = await client.GET(
        "/extended/v1/address/{principal}/stx",
        {
          params: {
            path: { principal: address },
          },
        }
      );
      return Number(response.data.balance);
    } catch (error) {
      console.warn(`Error fetching STX balance for ${address}:`, error);
      return 0;
    }
  });
}

/**
 * Gets the pool balances by checking token balances
 */
async function getPoolReserves(
  client: any,
  poolContract: string,
  token0Contract: string,
  token1Contract: string
): Promise<[number, number]> {
  const cacheKey = cache.generateKey(
    "getPoolReserves",
    poolContract,
    token0Contract,
    token1Contract
  );
  return cache.getOrSet(cacheKey, async () => {
    try {
      const [contractAddress] = poolContract.split(".");

      // Handle special case if either token is STX
      const balance0Promise =
        token0Contract === ".stx"
          ? getStxBalance(client, contractAddress)
          : getTokenBalance(client, token0Contract, poolContract);

      const balance1Promise =
        token1Contract === ".stx"
          ? getStxBalance(client, contractAddress)
          : getTokenBalance(client, token1Contract, poolContract);

      const [balance0, balance1] = await Promise.all([
        balance0Promise,
        balance1Promise,
      ]);
      return [balance0, balance1];
    } catch (error) {
      console.warn(`Error fetching pool balances for ${poolContract}:`, error);
      return [0, 0];
    }
  });
}

/**
 * Discovers all Dexterity vaults on the network and returns initialized vault instances
 */
export async function discoverVaults(
  network: StacksNetwork,
  defaultSlippage: number = 0.5,
  params: ContractSearchParams = {}
): Promise<SearchResult> {
  const { limit = 20, offset = 0, excludePools = [] } = params;

  const client = await createStacksClient(network);

  try {
    // Find Dexterity contracts
    const response = await client.GET("/extended/v1/contract/by_trait", {
      params: {
        query: {
          trait_abi: JSON.stringify(DEXTERITY_ABI),
          limit: Math.min(limit, 50),
          offset: Math.max(offset, 0),
        },
      },
    });

    const vaults = new Map<string, Vault>();
    const pools: LPToken[] = [];

    if (!response.data) {
      throw new Error("No results found");
    }

    // Process each contract
    for (const contract of response.data.results) {
      console.log(contract);
      // Skip excluded pools
      if (excludePools.includes(contract.contract_id)) {
        continue;
      }

      try {
        // Get pool metadata
        const metadata = await getTokenMetadata(client, contract.contract_id);
        if (!metadata.properties) {
          console.warn(
            `No properties found in metadata for ${contract.contract_id}`
          );
          continue;
        }

        // Get token information for both tokens
        const [token0, token1] = await Promise.all([
          getTokenInfo(client, metadata.properties.tokenAContract),
          getTokenInfo(client, metadata.properties.tokenBContract),
        ]);

        // Get current reserves
        const [reserve0, reserve1] = await getPoolReserves(
          client,
          contract.contract_id,
          metadata.properties.tokenAContract,
          metadata.properties.tokenBContract
        );

        // Convert LP rebate percent to fee (e.g., 5% rebate = 3000 fee points)
        const fee = Math.floor(
          (metadata.properties.lpRebatePercent / 100) * 1000000
        );

        // Construct LPToken
        const pool: LPToken = {
          contractId: metadata.properties.contractName,
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          identifier: metadata.identifier,
          description: metadata.description,
          image: metadata.image,
          fee,
          liquidity: [
            {
              token: token0,
              reserves: reserve0,
            },
            {
              token: token1,
              reserves: reserve1,
            },
          ],
          supply: 0, // Will be updated with actual supply if needed
        };

        // Create vault instance
        const vault = new Vault(pool, {
          network,
          slippage: defaultSlippage,
        });

        vaults.set(contract.contract_id, vault);
        pools.push(pool);
      } catch (error) {
        console.warn(
          `Failed to process contract ${contract.contract_id}:`,
          error
        );
        continue;
      }
    }

    return { vaults, pools };
  } catch (error) {
    console.error("Failed to discover vaults:", error);
    throw error;
  }
}

export const DEXTERITY_ABI = {
  maps: [],
  epoch: "Epoch30",
  functions: [
    {
      args: [
        {
          name: "amount",
          type: "uint128",
        },
        {
          name: "opcode",
          type: {
            optional: {
              buffer: {
                length: 16,
              },
            },
          },
        },
      ],
      name: "execute",
      access: "public",
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                {
                  name: "dk",
                  type: "uint128",
                },
                {
                  name: "dx",
                  type: "uint128",
                },
                {
                  name: "dy",
                  type: "uint128",
                },
              ],
            },
            error: "uint128",
          },
        },
      },
    },
    {
      args: [
        {
          name: "amount",
          type: "uint128",
        },
        {
          name: "opcode",
          type: {
            optional: {
              buffer: {
                length: 16,
              },
            },
          },
        },
      ],
      name: "quote",
      access: "read_only",
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                {
                  name: "dk",
                  type: "uint128",
                },
                {
                  name: "dx",
                  type: "uint128",
                },
                {
                  name: "dy",
                  type: "uint128",
                },
              ],
            },
            error: "uint128",
          },
        },
      },
    },
  ],
  variables: [],
  clarity_version: "Clarity3",
  fungible_tokens: [],
  non_fungible_tokens: [],
};
