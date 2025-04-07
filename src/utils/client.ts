import { createClient, Client } from "@stacks/blockchain-api-client";
import { cvToValue, hexToCV, parseToCV, cvToHex, makeContractCall, broadcastTransaction } from "@stacks/transactions";
import { ContractId, Token, TokenMetadata } from "../types";
import { paths } from "@stacks/blockchain-api-client/lib/generated/schema";
import { Dexterity } from "../core/sdk";
import { getFetchOptions } from "@stacks/common";

const API_ENDPOINTS = [
  "https://api.hiro.so/",
  "https://api.mainnet.hiro.so/",
  "https://stacks-node-api.mainnet.stacks.co/",
]

export class StacksClient {
  private static instance: StacksClient;
  private static currentKeyIndex = 0;
  private static currentClientIndex = 0;
  private clients: Client<paths, `${string}/${string}`>[];

  private constructor() {
    // Create a client for each endpoint
    this.clients = API_ENDPOINTS.map(endpoint =>
      createClient({ baseUrl: endpoint })
    );

    // Add API key handling middleware to each client
    this.clients.forEach(client => {
      client.use({
        onRequest({ request }) {
          const apiKeys = Dexterity.config.apiKeys || [Dexterity.config.apiKey];
          if (!apiKeys.length) return;

          const key = StacksClient.getNextApiKey(apiKeys);
          request.headers.set("x-api-key", key);
        },
      });
    });
  }

  private getCurrentClient(): Client<paths, `${string}/${string}`> {
    const client = this.clients[StacksClient.currentClientIndex];
    StacksClient.currentClientIndex = (StacksClient.currentClientIndex + 1) % this.clients.length;
    return client;
  }

  private static getNextApiKey(apiKeys: string[]): string {
    if (!apiKeys.length) return "";

    const rotationStrategy = Dexterity.config.apiKeyRotation || "loop";

    if (rotationStrategy === "random") {
      const randomIndex = Math.floor(Math.random() * apiKeys.length);
      return apiKeys[randomIndex];
    } else {
      // Default loop strategy
      const key = apiKeys[StacksClient.currentKeyIndex];
      StacksClient.currentKeyIndex = (StacksClient.currentKeyIndex + 1) % apiKeys.length;
      return key;
    }
  }

  static setKeyIndex(index = 0): void {
    StacksClient.currentKeyIndex = index;
  }

  static getInstance(): StacksClient {
    if (!StacksClient.instance) {
      StacksClient.instance = new StacksClient();
    }
    return StacksClient.instance;
  }

  /**
   * Contract Read Methods
   */
  async callReadOnly(
    contractId: string,
    method: string,
    args: any[] = [],
    retries: number = 3
  ): Promise<any> {
    const [address, name] = contractId.split(".");
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await this.getCurrentClient().POST(
          `/v2/contracts/call-read/${address}/${name}/${method}` as any,
          { body: { sender: address, arguments: args } }
        );

        if (!response?.data?.result) {
          throw new Error(`\nNo result from contract call ${method}`);
        }

        return cvToValue(hexToCV(response.data.result)).value;
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          console.error(error);
          throw new Error(
            `\nFailed to call ${contractId} read-only method ${method} after ${retries} attempts: ${error}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * Dexterity.config.retryDelay));
      }
    }
  }

  async requestSponsoredTransaction(serializedTx: string) {
    const response = await fetch(Dexterity.config.sponsor, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serializedTx
      }),
    });

    return response.json();
  }

  async proxyReadOnly(
    contractId: string,
    method: string,
    args: any[] = []
  ): Promise<any> {
    const response = await fetch(Dexterity.config.proxy, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contractId,
        method,
        args,
      }),
    });

    return response.json();
  }

  async getTokenMetadata(contractId: string): Promise<TokenMetadata | null> {
    try {
      // Build the URL path with properly encoded principal
      const path = `/metadata/v1/ft/${contractId}`;

      // Try to fetch the metadata using our metadata fetch method with API keys
      try {
        // Use our custom fetchMetadata method to make the request
        const response = await this.fetchMetadata(path)

        // If we caught a 404, or had other issues, fall back to the contract methods
        if (!response || !response.ok) {
          console.warn(`Failed to fetch metadata from Hiro API: ${response?.status || 'unknown error'}`);
          return await this.getTokenMetadataFallback(contractId);
        }

        // Parse the JSON metadata from the API
        const apiMetadata = await response.json();

        // Map the API response to our TokenMetadata interface
        return {
          name: apiMetadata.name || `LP Token ${contractId.split('.')[1]}`,
          description: apiMetadata.description || `Liquidity Pool Token for ${contractId}`,
          image: apiMetadata.image_uri || apiMetadata.image_canonical_uri || "",
          identifier: apiMetadata.asset_identifier.split("::")[1],
          symbol: apiMetadata.symbol || "LP",
          decimals: apiMetadata.decimals || 6,
          total_supply: apiMetadata.total_supply,
          token_uri: apiMetadata.token_uri,
          image_uri: apiMetadata.image_uri,
          image_thumbnail_uri: apiMetadata.image_thumbnail_uri,
          image_canonical_uri: apiMetadata.image_canonical_uri,
          tx_id: apiMetadata.tx_id,
          sender_address: apiMetadata.sender_address,
          contract_principal: apiMetadata.contract_principal || contractId,
          asset_identifier: apiMetadata.asset_identifier,
          metadata: apiMetadata.metadata,
          properties: {
            tokenAContract: apiMetadata.metadata?.properties?.tokenAContract || "",
            tokenBContract: apiMetadata.metadata?.properties?.tokenBContract || "",
            lpRebatePercent: parseFloat(apiMetadata.metadata?.properties?.lpRebatePercent) || 0.3,
            externalPoolId: apiMetadata.metadata?.properties?.externalPoolId || "",
            engineContractId: apiMetadata.metadata?.properties?.engineContractId || ""
          }
        };
      } catch (error) {
        console.warn(`Error fetching from Hiro API for ${contractId}: ${error}`);
        return await this.getTokenMetadataFallback(contractId);
      }
    } catch (error) {
      console.error(`Complete metadata retrieval failed for ${contractId}: ${error}`);
      return null;
    }
  }

  /**
   * Get standard API headers with API key
   */
  private getApiHeaders(): Headers {
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    const apiKeys = Dexterity.config.apiKeys || [Dexterity.config.apiKey];
    if (apiKeys.length) {
      const key = StacksClient.getNextApiKey(apiKeys);
      headers.set('x-api-key', key);
    }

    return headers;
  }

  /**
   * Fetch from metadata API with API key rotation
   */
  private async fetchMetadata(path: string, options: RequestInit = {}): Promise<Response> {
    // Get API keys from config
    const apiKeys = Dexterity.config.apiKeys || [Dexterity.config.apiKey];

    // Create headers with API key
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (apiKeys.length) {
      const key = StacksClient.getNextApiKey(apiKeys);
      headers.set('x-api-key', key);
    }

    // Use one of our API endpoints
    const baseUrl = "https://api.hiro.so";

    // Make the fetch request with API key
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    });
  }

  /**
   * Fallback method to get token metadata using the old approach when the Hiro API fails
   */
  private async getTokenMetadataFallback(contractId: string): Promise<TokenMetadata | null> {
    try {
      // Try to get the token URI from the contract
      const result = await this.callReadOnly(contractId, "get-token-uri").catch(error => {
        console.warn(`Failed to get token URI for ${contractId}: ${error}`);
        return { value: null };
      });

      if (!result || !result.value) {
        // No token URI available, we can't proceed with this pool
        console.warn(`No token URI available for ${contractId}, skipping pool`);
        return null;
      }

      // Handle IPFS URIs
      let uri = result.value;
      if (uri.startsWith('ipfs://')) {
        const ipfsGateway = Dexterity.config.ipfsGateway || 'https://ipfs.io/';
        uri = uri.replace('ipfs://', ipfsGateway);
      }

      // Try to fetch the metadata
      let response;
      try {
        response = await fetch(uri);
      } catch (error) {
        console.warn(`Failed to fetch from ${uri}: ${error}`);
        return null;
      }

      if (!response.ok) {
        console.warn(`Failed to fetch metadata from ${uri}: ${response.status}`);
        return null;
      }

      // Parse the JSON metadata and fill in any missing fields with defaults
      try {
        const metadata = await response.json();

        // Ensure all required fields exist with reasonable defaults
        return {
          name: metadata.name || `LP Token ${contractId.split('.')[1]}`,
          description: metadata.description || `Liquidity Pool Token for ${contractId}`,
          image: metadata.image || "",
          identifier: metadata.identifier,
          symbol: metadata.symbol || "LP",
          decimals: metadata.decimals || 6,
          token_uri: uri,
          properties: {
            tokenAContract: metadata.properties?.tokenAContract || "",
            tokenBContract: metadata.properties?.tokenBContract || "",
            lpRebatePercent: metadata.properties?.lpRebatePercent || 0.3,
            externalPoolId: metadata.properties?.externalPoolId || "",
            engineContractId: metadata.properties?.engineContractId || ""
          }
        };
      } catch (error) {
        console.warn(`Failed to parse metadata JSON from ${uri}: ${error}`);
        return null;
      }
    } catch (error) {
      console.error(`Fallback metadata retrieval failed for ${contractId}: ${error}`);
      return null;
    }
  }

  // We've removed the direct calls and fallback methods as they weren't reliable
  // Now we'll just return null if we can't get metadata from the token URI

  /**
   * Get basic token information from the Hiro metadata API
   * 
   * This method uses the /metadata/v1/ft/{principal} endpoint to get complete token info
   * with fallbacks to contract read-only functions if the API fails
   */
  async getToken(contractId: string): Promise<Token | null> {
    try {
      // Build the path for metadata API
      const path = `/metadata/v1/ft/${contractId}`;

      try {
        // Use our metadata fetcher with API key rotation
        const response = await this.fetchMetadata(path);

        if (!response.ok) {
          if (response.status === 404) {
            console.warn(`No token info found for ${contractId} in Hiro API, falling back to contract methods`);
            return await this.getTokenInfoFallback(contractId);
          }

          console.warn(`Failed to fetch token info from Hiro API: ${response.status}`);
          return await this.getTokenInfoFallback(contractId);
        }

        // Parse the JSON metadata from the API
        const apiData = await response.json();

        // Map the API response to our Token interface
        return {
          contractId: contractId as ContractId,
          identifier: apiData.symbol,
          name: apiData.name,
          symbol: apiData.symbol,
          decimals: apiData.decimals ?? 0,
          supply: Number(apiData.total_supply),
          description: apiData.description || "",
          image: apiData.image_uri || apiData.image_canonical_uri || ""
        };
      } catch (error) {
        console.warn(`Error fetching token info from Hiro API for ${contractId}: ${error}`);
        return await this.getTokenInfoFallback(contractId);
      }
    } catch (error) {
      console.error(`Complete token info retrieval failed for ${contractId}: ${error}`);
      return null;
    }
  }

  /**
   * Fallback method to get token info using contract read-only methods
   */
  private async getTokenInfoFallback(contractId: string): Promise<Token | null> {
    try {
      // Get token info from contract methods
      const [identifier, symbol, decimals, name, supply] = await Promise.all([
        this.getTokenIdentifier(contractId),
        this.getTokenSymbol(contractId),
        this.getTokenDecimals(contractId),
        this.getTokenName(contractId),
        this.getTotalSupply(contractId).catch(() => 0)
      ]);

      return {
        contractId: contractId as ContractId,
        identifier,
        name,
        symbol,
        decimals,
        supply,
        description: "",
        image: ""
      };
    } catch (error) {
      console.error(`Fallback token info retrieval failed for ${contractId}: ${error}`);
      return null;
    }
  }

  async getTokenIdentifier(contractId: string): Promise<string> {
    try {
      const response = await this.getCurrentClient().GET(
        "/extended/v1/contract/{contract_id}",
        { params: { path: { contract_id: contractId } } }
      );
      const abi = JSON.parse(response.data?.abi!);
      return abi.fungible_tokens[0].name;

    } catch (error) {
      console.error(`\nFailed to fetch token identifier for ${contractId}:`, error);
      return "UNKNOWN";
    }
  }

  async getTotalSupply(contractId: string): Promise<number> {
    const value = await this.callReadOnly(contractId, "get-total-supply");
    return Number(value);
  }

  async getTokenDecimals(contractId: string): Promise<number> {
    const value = await this.callReadOnly(contractId, "get-decimals");
    return Number(value);
  }

  async getTokenSymbol(contractId: string): Promise<string> {
    const value = await this.callReadOnly(contractId, "get-symbol");
    return String(value);
  }

  async getTokenName(contractId: string): Promise<string> {
    const value = await this.callReadOnly(contractId, "get-name");
    return String(value);
  }

  async getTokenBalance(
    tokenContract: string,
    holderContract: string
  ): Promise<number> {
    try {
      const value = await this.callReadOnly(tokenContract, "get-balance", [
        cvToHex(parseToCV(holderContract, "principal")),
      ]);
      return Number(value);
    } catch (error) {
      console.warn(
        `Error fetching balance for ${tokenContract} of ${holderContract}:`,
        error
      );
      return 0;
    }
  }

  async getStxBalance(
    address: string,
    retries: number = 3
  ): Promise<any> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await this.getCurrentClient().GET(
          `/extended/v1/address/${address}/stx` as any
        );
        return Number(response.data.balance);
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          console.warn(
            `Error fetching STX balance for ${address} after ${retries} attempts:`,
            error
          );
          return 0;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  /**
   * Contract Search Methods
   */
  /**
   * Search for fungible tokens using Hiro's metadata API
   * This is useful for finding all available tokens
   */
  async searchTokens(
    options: {
      name?: string;
      symbol?: string;
      address?: string;
      offset?: number;
      limit?: number;
      order_by?: string;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<any[]> {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (options.name) queryParams.append('name', options.name);
      if (options.symbol) queryParams.append('symbol', options.symbol);
      if (options.address) queryParams.append('address', options.address);
      if (options.offset !== undefined) queryParams.append('offset', options.offset.toString());
      if (options.limit !== undefined) queryParams.append('limit', options.limit.toString());
      if (options.order_by) queryParams.append('order_by', options.order_by);
      if (options.order) queryParams.append('order', options.order);

      // Use our metadata fetcher with API key rotation
      const response = await this.fetchMetadata(`/metadata/v1/ft?${queryParams.toString()}`);

      if (!response.ok) {
        console.warn(`Failed to fetch tokens from Hiro API: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error searching tokens:', error);
      return [];
    }
  }

  /**
   * Search for contracts by trait
   */
  async searchContractsByTrait(
    trait: any,
    limit?: number
  ): Promise<any[]> {
    let allContracts: any[] = [];
    let offset = 0;
    let hasMore = true;

    const omitList = [
      'SP39859AD7RQ6NYK00EJ8HN1DWE40C576FBDGHPA0.chdollar',
      'SP39859AD7RQ6NYK00EJ8HN1DWE40C576FBDGHPA0.dmg-runes',
      'SP39859AD7RQ6NYK00EJ8HN1DWE40C576FBDGHPA0.uahdmg',
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.abtc-dog-vault-wrapper-alex',
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.satoshi-nakamoto-liquidity',
      'SP20VRJRCZ3FQG7RE4QSPFPQC24J92TKDXJVHWEAW.phoenix-charismatic',
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.a-fistful-of-dollars',
      'SP26PZG61DH667XCX51TZNBHXM4HG4M6B2HWVM47V.dmgsbtc-lp-token',
      'SP26PZG61DH667XCX51TZNBHXM4HG4M6B2HWVM47V.lp-token',
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.theyre-taking-our-jerbs',
      'SP23B2ZSDG9WKWPCKRERP6PV81FWNB4NECV6MKKAC.stxcha-lp-token',
      'SP3T1M18J3VX038KSYPP5G450WVWWG9F9G6GAZA4Q.iouwelshwelsh-lp-token',
      'SPGYCP878RYFVT03ZT8TWGPKNYTSQB1578VVXHGE.welshups-lp-token',
      'SP39859AD7RQ6NYK00EJ8HN1DWE40C576FBDGHPA0.chabtz-lp-token',
      'SP2F66ASMYZ9M8EEVD4S76RCF9X15WZD2EQFR5MV1.stxsbtc-lp-token',
      'SP14NS8MVBRHXMM96BQY0727AJ59SWPV7RMHC0NCG.pontis-bridge-ROONS'
    ];

    while (hasMore) {
      try {
        const response = await this.getCurrentClient().GET("/extended/v1/contract/by_trait", {
          params: {
            query: {
              trait_abi: JSON.stringify(trait),
              limit: 50,
              offset,
            },
          },
        });

        const results = response.data?.results || [];
        if (results.length === 0) {
          hasMore = false;
        } else {
          const filteredResults = results.filter(
            (contract: any) => !omitList.includes(contract.contract_id)
          );
          allContracts = [...allContracts, ...filteredResults];

          if (limit && allContracts.length >= limit) {
            allContracts = allContracts.slice(0, limit);
            hasMore = false;
          } else {
            offset += 50;
          }
        }
      } catch (error) {
        console.warn(`Error fetching contracts at offset ${offset}:`, error);
        hasMore = false;
      }
    }

    return allContracts;
  }

  /**
   * Block Methods
   */
  async getCurrentBlock(): Promise<number> {
    const response = await this.getCurrentClient().GET("/extended/v1/block" as any);
    return response.data.height;
  }
}
