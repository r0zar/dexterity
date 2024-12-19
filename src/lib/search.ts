import { StacksNetwork } from "@stacks/network";
import { createClient } from "@stacks/blockchain-api-client";
import { cvToValue, hexToCV } from "@stacks/transactions";

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

export interface ContractSearchParams {
  limit?: number;
  offset?: number;
}

export interface ContractResponse {
  contract_id: string;
  tx_id: string;
  block_height: number;
  source_code: string;
  abi: any;
}

function createStacksClient(network: StacksNetwork) {
  const client = createClient({
    baseUrl: network.client.baseUrl,
  });

  // Add API key if provided
  if (process.env.STACKS_API_KEY) {
    client.use({
      onRequest({ request }) {
        request.headers.set(
          "x-hiro-api-key",
          String(process.env.STACKS_API_KEY)
        );
        return request;
      },
    });
  }

  return client;
}

export async function findDexterityContracts(
  network: StacksNetwork,
  { limit = 20, offset = 0 }: ContractSearchParams = {}
): Promise<any> {
  const client = createStacksClient(network);

  try {
    const response = await client.GET("/extended/v1/contract/by_trait", {
      params: {
        query: {
          trait_abi: JSON.stringify(DEXTERITY_ABI),
          limit: Math.min(limit, 50),
          offset: Math.max(offset, 0),
        },
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error finding Dexterity contracts:", error);
    throw error;
  }
}

export async function getContractInfo(
  network: StacksNetwork,
  contractId: string
): Promise<any> {
  const client = createStacksClient(network);

  try {
    const response = await client.GET("/extended/v1/contract/{contract_id}", {
      params: {
        path: { contract_id: contractId },
      },
    });

    return response.data;
  } catch (error) {
    console.error(`Error fetching contract info for ${contractId}:`, error);
    throw error;
  }
}

// Helper function to get contract events
export async function getContractEvents(
  network: StacksNetwork,
  contractId: string,
  limit = 50,
  offset = 0
) {
  const client = createStacksClient(network);

  try {
    const response = await client.GET(
      "/extended/v1/contract/{contract_id}/events",
      {
        params: {
          path: { contract_id: contractId },
          query: { limit, offset },
        },
      }
    );

    return response.data?.results.map((event: any) => ({
      ...event,
      value: cvToValue(hexToCV(event.contract_log.value.hex)),
    }));
  } catch (error) {
    console.error(`Error fetching events for ${contractId}:`, error);
    throw error;
  }
}

// Helper to get all events (similar to getAllContractEvents from your code)
export async function getAllContractEvents(
  network: StacksNetwork,
  contractId: string,
  totalLimit: number = 5000
) {
  const client = createStacksClient(network);
  const allEvents: any[] = [];
  let offset = 0;
  let hasMore = true;
  const limitPerRequest = 50;

  while (hasMore && allEvents.length < totalLimit) {
    const events = await getContractEvents(
      network,
      contractId,
      Math.min(limitPerRequest, totalLimit - allEvents.length),
      offset
    );

    if (events && events.length > 0) {
      for (const event of events) {
        const tx = await client.GET("/extended/v1/tx/{tx_id}", {
          params: { path: { tx_id: event.tx_id } },
        });

        allEvents.push({
          ...tx.data,
          ...event.value,
        });
      }

      offset += events.length;
      hasMore = events.length === limitPerRequest;
    } else {
      hasMore = false;
    }
  }

  return allEvents;
}
