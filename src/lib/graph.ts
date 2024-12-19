import { Vault } from "./vault";
import type { LPToken, Token } from "../types";
import { Opcode, OperationType } from "./opcode";

export interface GraphNode {
  token: Token;
  outboundEdges: Map<string, GraphEdge>;
  inboundEdges: Map<string, GraphEdge>;
}

export interface GraphEdge {
  pool: LPToken;
  source: Token;
  target: Token;
  vault: Vault;
  data: EdgeData;
}

export interface EdgeData {
  liquidity: number;
  volume24h?: number;
  fees?: number;
  reserves?: {
    source: number;
    target: number;
  };
}

export interface RouteHop {
  pool: LPToken;
  vault: Vault;
  tokenIn: Token;
  tokenOut: Token;
  quote?: {
    amountIn: number;
    amountOut: number;
  };
}

export interface Route {
  path: Token[];
  hops: RouteHop[];
  expectedOutput: number;
  priceImpact: number;
  totalFees: number;
}

export interface GraphConfig {
  maxHops?: number;
  maxSplits?: number;
  preferredPools?: string[];
}

export class DexterityGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private config: GraphConfig;

  constructor(config: GraphConfig = {}) {
    this.config = {
      maxHops: config.maxHops || 3,
      maxSplits: config.maxSplits || 1,
      preferredPools: config.preferredPools || [],
    };
  }

  /**
   * Factory method to create graph from vaults
   */
  static async fromVaults(
    vaults: Map<string, Vault>,
    config?: GraphConfig
  ): Promise<DexterityGraph> {
    const graph = new DexterityGraph(config);

    // Add all vaults to the graph
    for (const vault of vaults.values()) {
      graph.addEdge(vault.getPool(), vault);
    }

    return graph;
  }

  /**
   * Helper Methods
   */

  /**
   * Get a node by token contract ID
   */
  getNode(contractId: string): GraphNode | undefined {
    return this.nodes.get(contractId);
  }

  /**
   * Get all tokens in the graph
   */
  getTokens(): Token[] {
    return Array.from(this.nodes.values()).map((node) => node.token);
  }

  /**
   * Get a specific token by contract ID
   */
  getToken(contractId: string): Token | undefined {
    return this.getNode(contractId)?.token;
  }

  /**
   * Get all pools in the graph
   */
  getPools(): LPToken[] {
    const pools = new Set<LPToken>();
    for (const edge of this.edges.values()) {
      pools.add(edge.pool);
    }
    return Array.from(pools);
  }

  /**
   * Get a specific pool by contract ID
   */
  getPool(poolId: string): LPToken | undefined {
    for (const edge of this.edges.values()) {
      if (edge.pool.contractId === poolId) {
        return edge.pool;
      }
    }
    return undefined;
  }

  /**
   * Get an edge by pool ID
   */
  getEdgeByPool(poolId: string): GraphEdge | undefined {
    for (const edge of this.edges.values()) {
      if (edge.pool.contractId === poolId) {
        return edge;
      }
    }
    return undefined;
  }

  /**
   * Get a vault by pool ID
   */
  getVault(poolId: string): Vault | undefined {
    return this.getEdgeByPool(poolId)?.vault;
  }

  /**
   * Check if a token exists in the graph
   */
  hasToken(contractId: string): boolean {
    return this.nodes.has(contractId);
  }

  /**
   * Check if a pool exists in the graph
   */
  hasPool(poolId: string): boolean {
    return this.getEdgeByPool(poolId) !== undefined;
  }

  /**
   * Get all edges for a token
   */
  getEdgesForToken(contractId: string): GraphEdge[] {
    const node = this.getNode(contractId);
    if (!node) return [];

    return [
      ...Array.from(node.outboundEdges.values()),
      ...Array.from(node.inboundEdges.values()),
    ];
  }

  /**
   * Get pools containing a token
   */
  getPoolsForToken(contractId: string): LPToken[] {
    return this.getEdgesForToken(contractId).map((edge) => edge.pool);
  }

  /**
   * Graph Construction
   */
  private addNode(token: Token): GraphNode {
    if (!this.nodes.has(token.contractId)) {
      this.nodes.set(token.contractId, {
        token,
        outboundEdges: new Map(),
        inboundEdges: new Map(),
      });
    }
    return this.nodes.get(token.contractId)!;
  }

  private addEdge(pool: LPToken, vault: Vault) {
    const token0Node = this.addNode(pool.liquidity[0].token);
    const token1Node = this.addNode(pool.liquidity[1].token);

    // Calculate edge data
    const edgeData: EdgeData = {
      liquidity: calculateLiquidity(pool),
      fees: pool.fee,
    };

    // Create bidirectional edges
    const edge0to1: GraphEdge = {
      pool,
      vault,
      source: pool.liquidity[0].token,
      target: pool.liquidity[1].token,
      data: edgeData,
    };

    const edge1to0: GraphEdge = {
      pool,
      vault,
      source: pool.liquidity[1].token,
      target: pool.liquidity[0].token,
      data: edgeData,
    };

    // Add to nodes
    token0Node.outboundEdges.set(pool.liquidity[1].token.contractId, edge0to1);
    token0Node.inboundEdges.set(pool.liquidity[1].token.contractId, edge1to0);
    token1Node.outboundEdges.set(pool.liquidity[0].token.contractId, edge1to0);
    token1Node.inboundEdges.set(pool.liquidity[0].token.contractId, edge0to1);

    // Store edges
    const edgeId0to1 = getEdgeId(
      pool.liquidity[0].token.contractId,
      pool.liquidity[1].token.contractId
    );
    const edgeId1to0 = getEdgeId(
      pool.liquidity[1].token.contractId,
      pool.liquidity[0].token.contractId
    );
    this.edges.set(edgeId0to1, edge0to1);
    this.edges.set(edgeId1to0, edge1to0);
  }

  /**
   * Path Finding
   */
  async findBestRoute(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: number,
    senderAddress: string
  ): Promise<Route | null> {
    const paths = this.findAllPaths(
      tokenIn.contractId,
      tokenOut.contractId,
      this.config.maxHops || 3
    );

    if (paths.length === 0) return null;

    const routes: Route[] = [];

    for (const path of paths) {
      try {
        const route = await this.buildRoute(path, amountIn, senderAddress);
        if (route) routes.push(route);
      } catch (error) {
        console.warn("Error building route:", error);
      }
    }

    // Sort by expected output
    routes.sort((a, b) => b.expectedOutput - a.expectedOutput);
    return routes[0] || null;
  }

  private findAllPaths(
    fromId: string,
    toId: string,
    maxHops: number,
    visited: Set<string> = new Set()
  ): Token[][] {
    const paths: Token[][] = [];
    const startNode = this.nodes.get(fromId);
    if (!startNode) return paths;

    visited.add(fromId);

    if (fromId === toId) {
      paths.push([startNode.token]);
      visited.delete(fromId);
      return paths;
    }

    if (visited.size > maxHops) {
      visited.delete(fromId);
      return paths;
    }

    for (const [targetId, edge] of startNode.outboundEdges) {
      if (!visited.has(targetId)) {
        const subPaths = this.findAllPaths(targetId, toId, maxHops, visited);
        for (const subPath of subPaths) {
          paths.push([startNode.token, ...subPath]);
        }
      }
    }

    visited.delete(fromId);
    return paths;
  }

  /**
   * Route Building
   */
  private async buildRoute(
    path: Token[],
    amountIn: number,
    senderAddress: string
  ): Promise<Route | null> {
    if (path.length < 2) return null;

    const hops: RouteHop[] = [];
    let currentAmount = amountIn;

    // Build each hop
    for (let i = 0; i < path.length - 1; i++) {
      const tokenIn = path[i];
      const tokenOut = path[i + 1];
      const edge = this.getEdge(tokenIn.contractId, tokenOut.contractId);
      if (!edge) return null;

      // Get quote for this hop
      const opcode = new Opcode().setOperation(OperationType.SWAP_A_TO_B);

      try {
        const quote = await edge.vault.quote(
          senderAddress,
          currentAmount,
          opcode
        );

        const hop: RouteHop = {
          pool: edge.pool,
          vault: edge.vault,
          tokenIn,
          tokenOut,
          quote: {
            amountIn: currentAmount,
            amountOut: quote.dy,
          },
        };

        hops.push(hop);
        currentAmount = quote.dy;
      } catch (error) {
        console.error("Error getting quote for hop:", error);
        return null;
      }
    }

    // Calculate route metrics
    const expectedOutput = hops[hops.length - 1].quote!.amountOut;
    const priceImpact = calculatePriceImpact(hops);
    const totalFees = calculateTotalFees(hops);

    return {
      path,
      hops,
      expectedOutput,
      priceImpact,
      totalFees,
    };
  }

  /**
   * Helper Methods
   */
  private getEdge(fromId: string, toId: string): GraphEdge | null {
    const edgeId = getEdgeId(fromId, toId);
    return this.edges.get(edgeId) || null;
  }

  updateEdgeData(edge: GraphEdge, data: Partial<EdgeData>) {
    edge.data = { ...edge.data, ...data };
  }
}

/**
 * Utility Functions
 */
function getEdgeId(fromId: string, toId: string): string {
  return `${fromId}-${toId}`;
}

function calculateLiquidity(pool: LPToken): number {
  return pool.liquidity[0].reserves + pool.liquidity[1].reserves;
}

function calculatePriceImpact(hops: RouteHop[]): number {
  // Implement price impact calculation
  return 0;
}

function calculateTotalFees(hops: RouteHop[]): number {
  return hops.reduce((total, hop) => total + (hop.pool.fee || 0), 0);
}
