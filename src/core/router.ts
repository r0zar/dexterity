// src/core/router.ts

import { Vault } from "./vault";
import { Opcode } from "./opcode";
import { ErrorUtils } from "../utils";
import { ERROR_CODES } from "../constants";
import { Dexterity } from "./sdk";
import { debugUtils } from "../utils/router.debug";
import {
  uintCV,
  PostConditionMode,
  cvToHex,
  TxBroadcastResult,
  makeContractCall,
  broadcastTransaction,
  ClarityValue,
  ContractCallOptions,
  tupleCV,
  principalCV,
} from "@stacks/transactions";
import type {
  Token,
  Route,
  RouteHop,
  ExecuteOptions,
  ContractId,
} from "../types";
import { DEFAULT_SDK_CONFIG } from "../config";
import { openContractCall, TransactionOptions } from "@stacks/connect";

interface GraphEdge {
  vault: Vault;
  target: Token;
  liquidity: number;
  fee: number;
}

interface GraphNode {
  token: Token;
  edges: Map<string, GraphEdge>;
}

export class Router {
  static vaults: Map<string, Vault> = new Map();
  static nodes: Map<string, GraphNode> = new Map();
  static maxHops: number = DEFAULT_SDK_CONFIG.maxHops;

  // -----------------------------------
  // Transaction building for multi-hops
  // -----------------------------------
  static buildRouterTransaction(route: Route, amount: number) {
    // Collect post-conditions from each hop’s vault
    const allPostConditions: any[] = [];
    for (const hop of route.hops) {
      const hopAmountIn = hop.quote?.amountIn ?? amount;
      const hopAmountOut = hop.quote?.amountOut ?? 0;

      // Use vault’s method to build the basic post-conditions for this hop
      const pc = hop.vault.buildSwapPostConditions(
        hop.tokenIn,
        hop.tokenOut,
        hopAmountIn,
        hopAmountOut
      );
      allPostConditions.push(...pc);
    }

    const functionArgs = [
      uintCV(amount),
      ...route.hops.map((hop) =>
        tupleCV({
          pool: principalCV(hop.vault.getPool().contractId),
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
      postConditions: allPostConditions,
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
      if (Dexterity.config.mode === "server") {
        // Server-side: create and broadcast transaction
        const transaction = await makeContractCall({
          ...txConfig,
          senderKey: Dexterity.config.privateKey,
          fee: options?.fee || 10000,
        });
        return broadcastTransaction({ transaction });
      } else {
        // Client-side: use wallet to sign and broadcast
        await openContractCall({
          ...txConfig,
          fee: options?.fee || 10000,
        });
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
    for (const vault of vaults) {
      this.vaults.set(vault.getPool().contractId, vault);
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

      node0.edges.set(token1.contractId, {
        vault,
        target: token1,
        liquidity: reserve1,
        fee: vault.getFee(),
      });
      node1.edges.set(token0.contractId, {
        vault,
        target: token0,
        liquidity: reserve0,
        fee: vault.getFee(),
      });
    }
  }

  static getVaultsForToken(tokenId: string): Map<string, Vault> {
    const node = this.nodes.get(tokenId);
    if (!node) return new Map();
    const vaults = new Map<string, Vault>();
    for (const edge of node.edges.values()) {
      vaults.set(edge.vault.getPool().contractId, edge.vault);
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
    debugUtils.logPathfindingStart(tokenIn, tokenOut, amount, this.maxHops);
    const paths = this.findAllPaths(tokenIn, tokenOut, this.maxHops);

    if (paths.length === 0) {
      debugUtils.logNoPathsFound();
      return ErrorUtils.createError(
          ERROR_CODES.INVALID_PATH,
          `No path found from ${tokenIn} to ${tokenOut}`
        )
    }

    const routePromises = paths.map((p) => this.evaluateRoute(p, amount));
    try {
      const results = await Promise.all(routePromises);
      const allRoutes = results.filter((r) => !(r instanceof Error)) as Route[];
      const validRoutes = allRoutes.sort((a, b) => b.amountOut - a.amountOut);

      const bestRouteAnalysis = validRoutes[0]
        ? this.analyzeRoute(validRoutes[0])
        : null;
      debugUtils.logFoundPaths(
        paths.length,
        validRoutes.length,
        bestRouteAnalysis
      );

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

  private static findAllPaths(
    fromId: string,
    toId: string,
    maxHops: number,
    path: Token[] = [],
    visited: Set<string> = new Set()
  ): Token[][] {
    const startTime = Date.now();
    const results: Token[][] = [];
    const node = this.nodes.get(fromId);
    if (!node) return results;

    debugUtils.incrementPathsExplored();
    const newPath = [...path, node.token];
    visited.add(fromId);

    let found = 0;
    if (fromId === toId && newPath.length > 1) {
      results.push(newPath);
      found++;
    } else if (newPath.length <= maxHops) {
      for (const [targetId] of node.edges) {
        if (!visited.has(targetId)) {
          const nested = this.findAllPaths(
            targetId,
            toId,
            maxHops,
            newPath,
            new Set(visited)
          );
          found += nested.length;
          results.push(...nested);
        }
      }
    }

    debugUtils.logPathExploration(
      fromId,
      Array.from(visited),
      newPath.length,
      found,
      Date.now() - startTime
    );
    return results;
  }

  private static async evaluateRoute(
    tokens: Token[],
    amount: number
  ): Promise<Route | Error> {
    const startTime = Date.now();
    const hopDetails: any[] = [];

    try {
      const hops: RouteHop[] = [];
      let currentAmount = amount;
      let totalFees = 0;

      for (let i = 0; i < tokens.length - 1; i++) {
        const tokenIn = tokens[i];
        const tokenOut = tokens[i + 1];
        const node = this.nodes.get(tokenIn.contractId);
        if (!node) throw new Error(`Node not found: ${tokenIn.contractId}`);

        const edge = node.edges.get(tokenOut.contractId);
        if (!edge) throw new Error(`Edge not found: ${tokenOut.contractId}`);

        // Build an opcode for this direction
        const [tokenA] = edge.vault.getTokens();
        const isAtoB = tokenIn.contractId === tokenA.contractId;
        const opcode = new Opcode().setOperation(isAtoB ? 0x00 : 0x01);

        debugUtils.incrementQuotesRequested();
        const quote = await edge.vault.quote(currentAmount, opcode);
        if (quote instanceof Error) throw quote;

        totalFees += quote.fee;

        hopDetails.push({
          tokenIn: tokenIn.contractId,
          tokenOut: tokenOut.contractId,
          vault: edge.vault,
          amountIn: currentAmount,
          amountOut: quote.amountOut,
        });

        hops.push({
          vault: edge.vault,
          opcode, // store entire opcode
          tokenIn,
          tokenOut,
          quote: {
            amountIn: currentAmount,
            amountOut: quote.amountOut,
          },
        });

        currentAmount = quote.amountOut;
      }

      const route: Route = {
        path: tokens,
        hops,
        amountIn: amount,
        amountOut: currentAmount,
        totalFees,
      };

      debugUtils.logRouteEvaluation(
        tokens.map((t) => t.contractId),
        amount,
        currentAmount,
        totalFees,
        hopDetails,
        Date.now() - startTime
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
  static getBestVaultForPair(tokenAId: string, tokenBId: string): Vault | null {
    const node = this.nodes.get(tokenAId);
    if (!node) return null;
    const edge = node.edges.get(tokenBId);
    return edge?.vault ?? null;
  }

  static analyzeRoute(route: Route) {
    return {
      totalHops: route.hops.length,
      totalFees: route.totalFees,
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
