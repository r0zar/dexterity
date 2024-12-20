import { Pc, PostConditionMode } from "@stacks/transactions";
import { Vault } from "./vault";
import { Opcode, OperationType } from "./opcode";
import type { Token, TransactionConfig, Quote } from "../types";

export interface EngineConfig {
  maxHops?: number;
  maxSplits?: number;
  preferredVaults?: string[];
  routerAddress?: string;
  routerName?: string;
  defaultSlippage?: number;
  minimumLiquidity?: number;
  stxAddress?: string;
  network?: any;
}

interface GraphNode {
  token: Token;
  outboundEdges: Map<string, GraphEdge>;
  inboundEdges: Map<string, GraphEdge>;
}

interface GraphEdge {
  vault: Vault;
  source: Token;
  target: Token;
  data: EdgeData;
}

interface EdgeData {
  liquidity: number;
  volume24h?: number;
  fees?: number;
}

interface RouteHop {
  vault: Vault;
  tokenIn: Token;
  tokenOut: Token;
  quote?: {
    amountIn: number;
    amountOut: number;
  };
}

interface Route {
  path: Token[];
  hops: RouteHop[];
  expectedOutput: number;
  priceImpact: number;
  totalFees: number;
}

const DEFAULT_CONFIG: EngineConfig = {
  maxHops: 3,
  maxSplits: 1,
  preferredVaults: [],
  routerAddress: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS",
  routerName: "multihop",
  defaultSlippage: 0.5,
  minimumLiquidity: 1000,
};

export class TradeEngine {
  private nodes: Map<string, GraphNode> = new Map();
  private vaults: Map<string, Vault> = new Map();
  private config: EngineConfig;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Factory method to create engine from vaults
   */
  static async fromVaults(
    vaults: Map<string, Vault>,
    config?: Partial<EngineConfig>
  ): Promise<TradeEngine> {
    const engine = new TradeEngine(config);

    for (const vault of vaults.values()) {
      engine.addVault(vault);
    }

    return engine;
  }

  /**
   * Core trading functionality
   */
  async buildTrade(
    tokenIn: Token,
    tokenOut: Token,
    amount: number,
    sender: string,
    options: {
      slippage?: number;
      maxHops?: number;
    } = {}
  ): Promise<TransactionConfig> {
    const slippage = options.slippage ?? this.config.defaultSlippage;
    const maxHops = Math.min(
      options.maxHops ?? this.config.maxHops!,
      this.config.maxHops!
    );

    const route = await this.findBestRoute(
      tokenIn,
      tokenOut,
      amount,
      sender,
      maxHops
    );

    if (!route) {
      throw new Error(
        `No route found from ${tokenIn.contractId} to ${tokenOut.contractId}`
      );
    }

    return this.buildRouteTransaction(route, amount, sender, slippage!);
  }

  /**
   * Route finding
   */
  async findBestRoute(
    tokenIn: Token,
    tokenOut: Token,
    amount: number,
    sender: string = this.config.stxAddress!,
    maxHops: number = this.config.maxHops!
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
        const route = await this.buildRoute(path, amount, sender);
        if (route) routes.push(route);
      } catch (error) {
        console.warn("Error building route:", error);
      }
    }

    routes.sort((a, b) => b.expectedOutput - a.expectedOutput);
    return routes[0] || null;
  }

  /**
   * Vault management
   */
  private addVault(vault: Vault) {
    const pool = vault.getPool();
    const token0 = pool.liquidity[0].token;
    const token1 = pool.liquidity[1].token;

    // Store vault
    this.vaults.set(pool.contractId, vault);

    // Add nodes if they don't exist
    if (!this.nodes.has(token0.contractId)) {
      this.nodes.set(token0.contractId, {
        token: token0,
        outboundEdges: new Map(),
        inboundEdges: new Map(),
      });
    }

    if (!this.nodes.has(token1.contractId)) {
      this.nodes.set(token1.contractId, {
        token: token1,
        outboundEdges: new Map(),
        inboundEdges: new Map(),
      });
    }

    // Create edge data
    const edgeData: EdgeData = {
      liquidity: pool.liquidity[0].reserves + pool.liquidity[1].reserves,
      fees: pool.fee,
    };

    // Create bidirectional edges
    const edge0to1: GraphEdge = {
      vault,
      source: token0,
      target: token1,
      data: edgeData,
    };

    const edge1to0: GraphEdge = {
      vault,
      source: token1,
      target: token0,
      data: edgeData,
    };

    // Add edges to nodes
    const node0 = this.nodes.get(token0.contractId)!;
    const node1 = this.nodes.get(token1.contractId)!;

    node0.outboundEdges.set(token1.contractId, edge0to1);
    node0.inboundEdges.set(token1.contractId, edge1to0);
    node1.outboundEdges.set(token0.contractId, edge1to0);
    node1.inboundEdges.set(token0.contractId, edge0to1);
  }

  /**
   * Public vault accessors
   */
  getVault(vaultId: string): Vault | undefined {
    return this.vaults.get(vaultId);
  }

  getAllVaults(): Vault[] {
    return Array.from(this.vaults.values());
  }

  getVaultsForToken(tokenId: string): Vault[] {
    const node = this.nodes.get(tokenId);
    if (!node) return [];

    const vaults = new Set<Vault>();
    for (const edge of [
      ...node.outboundEdges.values(),
      ...node.inboundEdges.values(),
    ]) {
      vaults.add(edge.vault);
    }
    return Array.from(vaults);
  }

  /**
   * Token management
   */
  getToken(tokenId: string): Token | undefined {
    return this.nodes.get(tokenId)?.token;
  }

  getAllTokens(): Token[] {
    return Array.from(this.nodes.values()).map((node) => node.token);
  }

  /**
   * Private helper methods
   */
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

  private async buildRoute(
    path: Token[],
    amount: number,
    sender: string = this.config.stxAddress!
  ): Promise<Route | null> {
    if (path.length < 2) return null;

    const hops: RouteHop[] = [];
    let currentAmount = amount;

    for (let i = 0; i < path.length - 1; i++) {
      const tokenIn = path[i];
      const tokenOut = path[i + 1];
      const edge = this.getEdge(tokenIn.contractId, tokenOut.contractId);
      if (!edge) return null;

      const opcode = new Opcode().setOperation(OperationType.SWAP_A_TO_B);

      try {
        const quote = await edge.vault.quote(sender, currentAmount, opcode);

        const hop: RouteHop = {
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

  private async buildRouteTransaction(
    route: Route,
    amount: number,
    sender: string = this.config.stxAddress!,
    slippage: number
  ): Promise<TransactionConfig> {
    if (
      !route ||
      route.hops.length < 1 ||
      route.hops.length > this.config.maxHops!
    ) {
      throw new Error(
        `Invalid route. Must have between 1 and ${this.config.maxHops} hops`
      );
    }

    // Build hop arguments
    const hopArgs = route.hops.map((hop) => ({
      pool: hop.vault.getPool().contractId,
      opcode: new Opcode().setOperation(OperationType.SWAP_A_TO_B).build(),
    }));

    return {
      network: route.hops[0].vault.getNetwork(),
      contractAddress: this.config.routerAddress!,
      contractName: this.config.routerName!,
      functionName: `swap-${route.hops.length}`,
      functionArgs: [amount, ...hopArgs],
      postConditionMode: PostConditionMode.Deny,
      postConditions: this.buildPostConditions(route, amount, sender, slippage),
    };
  }

  createPostCondition(
    token: Token,
    amount: number,
    sender: string = this.config.stxAddress!
  ) {
    if (token.contractId === ".stx") {
      return Pc.principal(sender).willSendEq(amount).ustx();
    }
    return Pc.principal(sender)
      .willSendEq(amount)
      .ft(token.contractId as any, token.identifier);
  }

  private buildPostConditions(
    route: Route,
    inputAmount: number,
    sender: string = this.config.stxAddress!,
    slippagePercent: number
  ): any[] {
    const threshold = 1 - slippagePercent / 100;

    const firstHop = route.hops[0];
    const lastHop = route.hops[route.hops.length - 1];

    const tokenInCondition = this.createPostCondition(
      firstHop.tokenIn,
      inputAmount,
      sender
    );

    const minimumOutput = Math.floor(route.expectedOutput * threshold);
    const tokenOutCondition = this.createPostCondition(
      lastHop.tokenOut,
      minimumOutput,
      sender
    );

    return [tokenInCondition, tokenOutCondition];
  }

  private getEdge(fromId: string, toId: string): GraphEdge | null {
    return this.nodes.get(fromId)?.outboundEdges.get(toId) || null;
  }
}

/**
 * Utility functions
 */
function calculatePriceImpact(hops: RouteHop[]): number {
  return hops.reduce((impact, hop) => {
    const pool = hop.vault.getPool();
    const inputReserves = pool.liquidity[0].reserves;
    const ratio = hop.quote!.amountIn / inputReserves;
    return impact + ratio;
  }, 0);
}

function calculateTotalFees(hops: RouteHop[]): number {
  return hops.reduce((total, hop) => total + hop.vault.getPool().fee, 0);
}
