// src/core/router.ts

import { Vault } from "./vault";
import { Opcode } from "./opcode";
import { ErrorUtils } from "../utils";
import { ERROR_CODES } from "../utils/constants";
import { Dexterity } from "./sdk";
import { debugUtils } from "../utils/debug";
import {
  uintCV,
  PostConditionMode,
  TxBroadcastResult,
  makeContractCall,
  broadcastTransaction,
  tupleCV,
  principalCV,
  FungiblePostCondition,
  ContractCallOptions,
} from "@stacks/transactions";
import type {
  Token,
  Route,
  Hop,
  ExecuteOptions,
  ContractId,
} from "../types";
import { Finished, SponsoredFinished } from "@stacks/connect";

interface GraphEdge {
  vault: Vault;
  target: Token;
  liquidity: number;
}

interface GraphNode {
  token: Token;
  edges: Map<string, GraphEdge>;
}

export class Router {
  static edges: Map<string, Vault> = new Map();
  static nodes: Map<string, GraphNode> = new Map();

  // -----------------------------------
  // Transaction building for multi-hops
  // -----------------------------------
  static buildRouterTransaction(route: Route, amount: number) {
    // Create a map to track combined post-conditions by token
    const pcMap = new Map<string, any>();

    for (const hop of route.hops) {
      const hopAmountIn = hop.quote?.amountIn ?? amount;
      const hopAmountOut = hop.quote?.amountOut ?? 0;

      // Get post-conditions for this hop
      const hopPCs = hop.vault.buildSwapPostConditions(
        hop.tokenIn,
        hop.tokenOut,
        hopAmountIn,
        hopAmountOut
      );

      // Combine post-conditions by token
      for (const pc of hopPCs as FungiblePostCondition[]) {
        const key = `${pc.address}-${pc.asset ?? 'STX'}}`;
        if (pcMap.has(key)) {
          // Add amounts for existing token PC
          const existingPC = pcMap.get(key);
          existingPC.amount = Number(existingPC.amount) + Number(pc.amount);
        } else {
          // Create new entry for this token PC
          pcMap.set(key, { ...pc });
        }
      }
    }

    const functionArgs = [
      uintCV(amount),
      ...route.hops.map((hop) =>
        tupleCV({
          pool: principalCV(hop.vault.contractId),
          opcode: hop.opcode.build(),
        })
      ),
    ];

    return {
      network: Dexterity.config.network!,
      contractAddress: Dexterity.config.routerAddress!,
      contractName: Dexterity.config.routerName!,
      functionName: `swap-${route.hops.length}`,
      functionArgs,
      postConditionMode: PostConditionMode.Deny,
      postConditions: Array.from(pcMap.values()), // Use combined post-conditions
      sponsored: Dexterity.config.sponsored,
    };
  }

  /**
   * Execute a multi-hop swap transaction
   */
  static async executeSwap(
    route: Route,
    amount: number,
    options?: ExecuteOptions
  ): Promise<TxBroadcastResult | void> {
    try {
      // First build the transaction config
      const txConfig = this.buildRouterTransaction(route, amount);

      if (options?.disablePostConditions) {
        console.warn("Post conditions disabled");
        txConfig.postConditionMode = PostConditionMode.Allow;
        txConfig.postConditions = []
      }

      if (Dexterity.config.mode === "server") {
        // Server-side: create and broadcast transaction
        const transaction = await makeContractCall({
          ...txConfig,
          senderKey: Dexterity.config.privateKey,
          fee: options?.fee || 1000,
        });
        if (Dexterity.config.sponsored) {
          return Dexterity.client.requestSponsoredTransaction(transaction.serialize());
        } else {
          return broadcastTransaction({ transaction });
        }
      } else {
        // Client-side: use wallet to sign and broadcast
        const { showContractCall } = await import('@stacks/connect')
        const contractCallOptions: any = {
          ...txConfig,
          sponsored: Dexterity.config.sponsored,
        }
        if (Dexterity.config.sponsored) {
          contractCallOptions.fee = options?.fee || 1000
        } else {
          contractCallOptions.onFinish = (data: any) => {
            Dexterity.client.requestSponsoredTransaction(data.txRaw)
              .then(r => r.json()).then(console.log).catch(console.error)
          }
        }
        await showContractCall(contractCallOptions);
      }
    } catch (error) {
      throw ErrorUtils.createError(
        ERROR_CODES.TRANSACTION_FAILED,
        "Failed to execute swap transaction",
        error
      );
    }
  }

  // -----------------------------------
  // Graph / Vault loading
  // -----------------------------------
  static loadVaults(vaults: Vault[]): void {
    // Clear existing data
    this.edges.clear();
    this.nodes.clear();

    for (const vault of vaults) {
      // Add to edges map (allow duplicates)
      this.edges.set(vault.contractId, vault);

      const [token0, token1] = vault.getTokens();
      const [reserve0, reserve1] = vault.getReserves();

      // Create nodes if missing
      if (!this.nodes.has(token0.contractId)) {
        this.nodes.set(token0.contractId, {
          token: token0,
          edges: new Map(),
        });
      }
      if (!this.nodes.has(token1.contractId)) {
        this.nodes.set(token1.contractId, {
          token: token1,
          edges: new Map(),
        });
      }

      const node0 = this.nodes.get(token0.contractId)!;
      const node1 = this.nodes.get(token1.contractId)!;

      // Create unique edge keys that include the vault ID
      const edge0Key = `${token1.contractId}-${vault.contractId}`;
      const edge1Key = `${token0.contractId}-${vault.contractId}`;

      // Add edges in both directions with unique keys
      node0.edges.set(edge0Key, {
        vault,
        target: token1,
        liquidity: reserve1,
      });

      node1.edges.set(edge1Key, {
        vault,
        target: token0,
        liquidity: reserve0,
      });
    }
  }

  static getVaultsForToken(tokenId: string): Map<string, Vault> {
    const node = this.nodes.get(tokenId);
    if (!node) return new Map();
    const vaults = new Map<string, Vault>();
    for (const edge of node.edges.values()) {
      vaults.set(edge.vault.contractId, edge.vault);
    }
    return vaults;
  }

  // -----------------------------------
  // Route-Finding & Evaluating
  // -----------------------------------
  static async findBestRoute(
    tokenIn: ContractId,
    tokenOut: ContractId,
    amount: number
  ): Promise<Route | Error> {
    debugUtils.logPathfindingStart(tokenIn, tokenOut, amount, Dexterity.config.maxHops);
    const paths = this.findAllPaths(tokenIn, tokenOut);

    if (paths.length === 0) {
      debugUtils.logNoPathsFound();
      return ErrorUtils.createError(
        ERROR_CODES.INVALID_PATH,
        `No path found from ${tokenIn} to ${tokenOut}`
      );
    }

    const routePromises = paths.map((p) => this.evaluateRoute(p, amount));
    try {
      const results = await Promise.all(routePromises);
      const allRoutes = results.filter((r) => !(r instanceof Error)) as Route[];
      const validRoutes = allRoutes.sort((a, b) => b.amountOut - a.amountOut);

      const bestRouteAnalysis = validRoutes[0]
        ? this.analyzeRoute(validRoutes[0])
        : null;
      debugUtils.logFoundPaths(paths.length, validRoutes.length, bestRouteAnalysis);

      if (validRoutes.length === 0) {
        return ErrorUtils.createError(
          ERROR_CODES.NO_VALID_ROUTE,
          "No valid routes found"
        );
      }

      return validRoutes[0];
    } catch (error) {
      return ErrorUtils.createError(
        ERROR_CODES.QUOTE_FAILED,
        "Failed to evaluate routes",
        error
      );
    }
  }

  static findAllPaths(
    fromId: string,
    toId: string,
    path: Token[] = [],
    visitedVaults: Set<string> = new Set()
  ): Token[][] {
    const results: Token[][] = [];
    const node = this.nodes.get(fromId);
    if (!node) return results;

    const newPath = [...path, node.token];

    // Add path if we've reached target token
    if (fromId === toId && path.length >= 2) {
      results.push(newPath);
    } else if (newPath[newPath.length - 1].contractId === toId) {
      results.push(newPath);
    }

    // Continue exploring if under max hops
    if (newPath.length <= Dexterity.config.maxHops) {
      // Group edges by target token
      const edgesByTarget = new Map<string, GraphEdge[]>();

      for (const [edgeKey, edge] of node.edges) {
        const targetId = edge.target.contractId;
        if (!edgesByTarget.has(targetId)) {
          edgesByTarget.set(targetId, []);
        }
        edgesByTarget.get(targetId)!.push(edge);
      }

      // Explore each target token's edges
      for (const [targetId, edges] of edgesByTarget) {
        for (const edge of edges) {
          const vaultId = edge.vault.contractId;

          // Skip if we've visited this vault before
          if (!visitedVaults.has(vaultId)) {
            const newVisitedVaults = new Set(visitedVaults);
            newVisitedVaults.add(vaultId);

            const nested = this.findAllPaths(
              targetId,
              toId,
              newPath,
              newVisitedVaults
            );
            results.push(...nested);
          }
        }
      }
    }

    return results;
  }

  static async evaluateRoute(
    tokens: Token[],
    amount: number
  ): Promise<Route | Error> {
    try {
      const hops: Hop[] = [];
      let currentAmount = amount;

      for (let i = 0; i < tokens.length - 1; i++) {
        const tokenIn = tokens[i];
        const tokenOut = tokens[i + 1];
        const node = this.nodes.get(tokenIn.contractId);
        if (!node) throw new Error(`Node not found: ${tokenIn.contractId}`);

        // Get all edges between these tokens
        const edges = Array.from(node.edges.values())
          .filter(edge => edge.target.contractId === tokenOut.contractId);

        if (edges.length === 0) {
          throw new Error(`No edges found: ${tokenIn.contractId} -> ${tokenOut.contractId}`);
        }

        // Get quotes from all edges
        const edgeQuotes = await Promise.all(edges.map(async edge => {
          const [tokenA] = edge.vault.getTokens();
          const isAtoB = tokenIn.contractId === tokenA.contractId;
          const opcode = new Opcode().setOperation(isAtoB ? 0x00 : 0x01);

          debugUtils.incrementQuotesRequested();
          const quote = await edge.vault.quote(currentAmount, opcode);
          return { edge, opcode, quote };
        }));

        // Find best quote
        const bestEdgeQuote = edgeQuotes.reduce((best, current) => {
          if (current.quote instanceof Error) return best;
          if (best.quote instanceof Error) return current;
          return current.quote.amountOut > best.quote.amountOut ? current : best;
        });

        if (bestEdgeQuote.quote instanceof Error) {
          throw bestEdgeQuote.quote;
        }

        hops.push({
          vault: bestEdgeQuote.edge.vault,
          opcode: bestEdgeQuote.opcode,
          tokenIn,
          tokenOut,
          quote: {
            amountIn: currentAmount,
            amountOut: bestEdgeQuote.quote.amountOut,
          },
        });

        currentAmount = bestEdgeQuote.quote.amountOut;
      }

      const route: Route = {
        path: tokens,
        hops,
        amountIn: amount,
        amountOut: currentAmount,
      };

      debugUtils.logRouteEvaluation(
        tokens.map((t) => t.contractId),
        amount,
        currentAmount,
      );

      return route;
    } catch (error) {
      return ErrorUtils.createError(
        ERROR_CODES.QUOTE_FAILED,
        "Failed to evaluate route",
        error
      );
    }
  }

  // -----------------------------------
  // Utility methods
  // -----------------------------------
  static getVaults(): Vault[] {
    return Array.from(this.edges.values());
  }

  static analyzeRoute(route: Route) {
    return {
      totalHops: route.hops.length,
      vaults: route.hops.map((h) => h.vault),
    };
  }

  static getGraphStats() {
    let totalEdges = 0;
    for (const node of this.nodes.values()) {
      totalEdges += node.edges.size;
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount: totalEdges,
      tokenIds: Array.from(this.nodes.keys()),
    };
  }
}
