import { createClient, Client } from "@stacks/blockchain-api-client";
import { cvToValue, hexToCV, parseToCV, cvToHex } from "@stacks/transactions";
import { TokenMetadata } from "../types";
import { paths } from "@stacks/blockchain-api-client/lib/generated/schema";
import { Dexterity } from "../core/sdk";
import { DEFAULT_SDK_CONFIG } from "../config";

export class StacksClient {
  static client: Client<paths, `${string}/${string}`> = createClient({
    baseUrl: DEFAULT_SDK_CONFIG.network?.client.baseUrl,
  });

  private constructor() {
    StacksClient.client.use({
      onRequest({ request }) {
        request.headers.set("x-hiro-api-key", Dexterity.config.apiKey!);
      },
    });
  }

  /**
   * Contract Read Methods
   */
  static async callReadOnly(
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
        await new Promise((resolve) => setTimeout(resolve, attempt * 10000)); // Incrementally longer timeout
      }
    }
  }

  static async proxyReadOnly(
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

  static async getTokenMetadata(contractId: string): Promise<TokenMetadata> {
    const { value } = await this.callReadOnly(contractId, "get-token-uri");

    if (!value) {
      throw new Error(`\nNo token URI found for ${contractId}`);
    }

    const response = await fetch(value);
    if (!response.ok) {
      throw new Error(`\nFailed to fetch metadata from ${value}`);
    }

    return response.json();
  }

  static async getTokenIdentifier(contractId: string): Promise<string> {
    const response = await this.client.GET(
      "/extended/v1/contract/{contract_id}",
      { params: { path: { contract_id: contractId } } }
    );
    const abi = JSON.parse(response.data?.abi!);
    return abi.fungible_tokens[0].name;
  }

  static async getTotalSupply(contractId: string): Promise<number> {
    const value = await this.callReadOnly(contractId, "get-total-supply");
    return Number(value);
  }

  static async getTokenDecimals(contractId: string): Promise<number> {
    const value = await this.callReadOnly(contractId, "get-decimals");
    return Number(value);
  }

  static async getTokenSymbol(contractId: string): Promise<string> {
    const value = await this.callReadOnly(contractId, "get-symbol");
    return String(value);
  }

  static async getTokenName(contractId: string): Promise<string> {
    const value = await this.callReadOnly(contractId, "get-name");
    return String(value);
  }

  static async getTokenBalance(
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

  static async getStxBalance(address: string): Promise<number> {
    try {
      const response = await this.client.GET(
        `/extended/v1/address/${address}/stx` as any
      );
      return Number(response.data.balance);
    } catch (error) {
      console.warn(`Error fetching STX balance for ${address}:`, error);
      return 0;
    }
  }

  /**
   * Contract Search Methods
   */
  static async searchContractsByTrait(
    trait: any,
    limit: number = 50
  ): Promise<any[]> {
    const response = await this.client.GET("/extended/v1/contract/by_trait", {
      params: {
        query: {
          trait_abi: JSON.stringify(trait),
          limit,
        },
      },
    });

    return response.data?.results || [];
  }

  /**
   * Block Methods
   */
  static async getCurrentBlock(): Promise<number> {
    const response = await this.client.GET("/extended/v1/block" as any);
    return response.data.height;
  }
}
