import type { Pool, Token } from "../types";
import { OpcodeBuilder, OperationType } from "./opcode";

export interface GraphNode {
  token: Token;
  outboundEdges: Map<string, GraphEdge>; // Target node ID -> Edge
  inboundEdges: Map<string, GraphEdge>; // Source node ID -> Edge
}

export interface GraphEdge {
  pool: Pool;
  source: Token;
  target: Token;
  data: EdgeData;
}

export interface EdgeData {
  liquidity: number; // Current liquidity
  volume24h?: number; // 24h volume
  fees?: number; // Fee rate
  reserves?: {
    // Current reserves
    source: number;
    target: number;
  };
}

export interface RouteHop {
  pool: Pool;
  tokenIn: Token;
  tokenOut: Token;
  quote?: {
    amountIn: number;
    amountOut: number;
  };
}

export interface Route {
  path: Token[]; // Token path
  hops: RouteHop[]; // Individual hops
  expectedOutput: number; // Expected output amount
  priceImpact: number; // Total price impact
  totalFees: number; // Total fees
}

export class DexterityGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  constructor(private sdk: any) {}

  /**
   * Graph Construction
   */

  addNode(token: Token) {
    if (!this.nodes.has(token.contractId)) {
      this.nodes.set(token.contractId, {
        token,
        outboundEdges: new Map(),
        inboundEdges: new Map(),
      });
    }
    return this.nodes.get(token.contractId)!;
  }

  addEdge(pool: Pool) {
    // Create bidirectional edges
    const token0Node = this.addNode(pool.token0);
    const token1Node = this.addNode(pool.token1);

    // Calculate edge data
    const edgeData: EdgeData = {
      liquidity: calculateLiquidity(pool),
      fees: pool.poolData.fee,
    };

    // Create 0 -> 1 edge
    const edge0to1: GraphEdge = {
      pool,
      source: pool.token0,
      target: pool.token1,
      data: edgeData,
    };

    // Create 1 -> 0 edge
    const edge1to0: GraphEdge = {
      pool,
      source: pool.token1,
      target: pool.token0,
      data: edgeData,
    };

    // Add to nodes
    token0Node.outboundEdges.set(pool.token1.contractId, edge0to1);
    token0Node.inboundEdges.set(pool.token1.contractId, edge1to0);
    token1Node.outboundEdges.set(pool.token0.contractId, edge1to0);
    token1Node.inboundEdges.set(pool.token0.contractId, edge0to1);

    // Store edges
    const edgeId0to1 = getEdgeId(
      pool.token0.contractId,
      pool.token1.contractId
    );
    const edgeId1to0 = getEdgeId(
      pool.token1.contractId,
      pool.token0.contractId
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
    maxHops: number = 3
  ): Promise<Route | null> {
    const paths = this.findAllPaths(
      tokenIn.contractId,
      tokenOut.contractId,
      maxHops
    );
    if (paths.length === 0) return null;

    const routes: Route[] = [];

    for (const path of paths) {
      try {
        const route = await this.buildRoute(path, amountIn);
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
    amountIn: number
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
      const opcode = new OpcodeBuilder()
        .setOperation(OperationType.SWAP_A_TO_B)
        .build();

      try {
        const quote = await this.sdk.getQuote(edge.pool, currentAmount, opcode);

        const hop: RouteHop = {
          pool: edge.pool,
          tokenIn,
          tokenOut,
          quote: {
            amountIn: currentAmount,
            amountOut: quote.dy.value,
          },
        };

        hops.push(hop);
        currentAmount = quote.dy.value;
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

function calculateLiquidity(pool: Pool): number {
  // Simplified TVL calculation
  return pool.poolData.reserve0 + pool.poolData.reserve1;
}

function calculatePriceImpact(hops: RouteHop[]): number {
  // Implement price impact calculation
  return 0;
}

function calculateTotalFees(hops: RouteHop[]): number {
  return hops.reduce((total, hop) => total + (hop.pool.poolData.fee || 0), 0);
}

/**
 * Usage Example
 */

/*
// Initialize
const graph = new DexterityGraph(sdk);

// Add pools
pools.forEach(pool => graph.addEdge(pool));

// Find best route
const route = await graph.findBestRoute(tokenIn, tokenOut, amount);
if (route) {
  console.log('Best route found:', {
    path: route.path.map(t => t.metadata.symbol),
    expectedOutput: route.expectedOutput,
    priceImpact: route.priceImpact,
    hops: route.hops.length
  });
}
*/
