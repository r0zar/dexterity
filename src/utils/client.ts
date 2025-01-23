import { createClient, Client } from "@stacks/blockchain-api-client";
import { cvToValue, hexToCV, parseToCV, cvToHex } from "@stacks/transactions";
import { TokenMetadata } from "../types";
import { paths } from "@stacks/blockchain-api-client/lib/generated/schema";
import { Dexterity } from "../core/sdk";
import { STACKS_MAINNET } from "@stacks/network";

export class StacksClient {
  private static instance: StacksClient;
  private static currentKeyIndex = 0;
  private client: Client<paths, `${string}/${string}`>;

  private constructor() {
    this.client = createClient({
      baseUrl: STACKS_MAINNET.client.baseUrl,
    });

    this.client.use({
      onRequest({ request }) {
        const apiKeys = Dexterity.config.apiKeys || [Dexterity.config.apiKey];
        if (!apiKeys.length) return;

        const key = StacksClient.getNextApiKey(apiKeys);
        request.headers.set("x-hiro-api-key", key);
      },
    });
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
        const response = await this.client.POST(
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
          throw new Error(
            `\nFailed to call read-only method ${method} after ${retries} attempts: ${error}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
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

  async getTokenMetadata(contractId: string): Promise<TokenMetadata> {
    const { value } = await this.callReadOnly(contractId, "get-token-uri");

    if (!value) {
      console.error(`\nNo token URI found for ${contractId}`);
      return {
        identifier: "Unknown",
        symbol: "Unknown",
        decimals: 6,
        name: "Unknown",
        description: "No token URI found for this contract",
        image: "",
        properties: {
          tokenAContract: "",
          tokenBContract: "",
          lpRebatePercent: 0,
        },
      };
    }

    // Handle IPFS URIs
    let uri = value;
    if (uri.startsWith('ipfs://')) {
      const ipfsGateway = Dexterity.config.ipfsGateway || 'https://ipfs.io/';
      uri = uri.replace('ipfs://', ipfsGateway);
    }

    const response = await fetch(uri);

    if (!response.ok) {
      console.error(`\nFailed to fetch metadata from ${uri}`);
      return {
        identifier: "Unknown",
        symbol: "Unknown",
        decimals: 6,
        name: "Unknown",
        description: "Failed to fetch metadata from token URI",
        image: "",
        properties: {
          tokenAContract: "",
          tokenBContract: "",
          lpRebatePercent: 0,
        },
      };
    }

    return response.json();
  }

  async getTokenIdentifier(contractId: string): Promise<string> {
    const response = await this.client.GET(
      "/extended/v1/contract/{contract_id}",
      { params: { path: { contract_id: contractId } } }
    );
    const abi = JSON.parse(response.data?.abi!);
    return abi.fungible_tokens[0].name;
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
        const response = await this.client.GET(
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
      'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.theyre-taking-our-jerbs'
    ];

    while (hasMore) {
      try {
        const response = await this.client.GET("/extended/v1/contract/by_trait", {
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
    const response = await this.client.GET("/extended/v1/block" as any);
    return response.data.height;
  }
}
