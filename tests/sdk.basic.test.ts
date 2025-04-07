import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Router } from "../src/core/router";
import { Opcode } from "../src/core/opcode";

// Test data - we'll get actual tokens from router
const STX_TOKEN = ".stx";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";

// Check if we're running in CI environment
const isCI = process.env.CI === 'true';

describe("Dexterity SDK - Basic Operations", () => {
  let skipNetworkTests = false;

  beforeAll(async () => {
    try {
      await Dexterity.configure({ debug: true });
      await Dexterity.discover({
        reserves: false,
        continueOnError: true // Continue even if some pools fail to load
      });
    } catch (error) {
      console.warn("Network-dependent tests will be skipped due to connection issues:", error);
      skipNetworkTests = true;
    }
  }, 200000);

  it("should discover pools", async () => {
    if (skipNetworkTests || isCI) {
      return;
    }
    const vaults = Dexterity.getVaults();
    expect(vaults.length).toBeGreaterThan(0);
  });

  it("should get direct swap quote", async () => {
    if (skipNetworkTests || isCI) {
      return;
    }
    const quote = await Dexterity.getQuote(STX_TOKEN, CHA_TOKEN, 1000000);
    expect(quote.amountIn).toBe(1000000);
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should build direct swap transaction", async () => {
    if (skipNetworkTests || isCI) {
      return;
    }
    const swapConfig = await Dexterity.buildSwap(STX_TOKEN, CHA_TOKEN, 1000);

    expect(swapConfig).toHaveProperty("functionName");
    expect(swapConfig.functionName).toMatch(/^swap-/);
    expect(swapConfig).toHaveProperty("postConditions");
    expect(swapConfig.postConditions).toBeInstanceOf(Array);
    expect(swapConfig.functionArgs.length).toBeGreaterThan(1);

    const [amountArg, opcodeArg] = swapConfig.functionArgs;
    expect(amountArg).toBeTypeOf("object");
    expect(opcodeArg).toBeTypeOf("object");
  });

  it("should make direct swap transaction", async () => {
    if (skipNetworkTests || isCI) {
      return;
    }
    const quoteResponse = await Dexterity.getQuote(STX_TOKEN, CHA_TOKEN, 100);
    const txResult = await Dexterity.router.executeSwap(quoteResponse.route, 100)
    console.log("Swap transaction result:", quoteResponse.route, txResult);
  });

  describe("Graph Structure", () => {
    it("should create correct graph nodes", () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      const nodes = Router.nodes;
      const tokens = [CHA_TOKEN, STX_TOKEN];

      for (const tokenId of tokens) {
        expect(nodes.has(tokenId)).toBe(true);
        const node = nodes.get(tokenId);
        expect(node?.token.contractId).toBe(tokenId);
      }
    });

    it("should create correct graph edges for multiple vaults", () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      const chaNode = Router.nodes.get(CHA_TOKEN);
      const stxNode = Router.nodes.get(STX_TOKEN);

      // Get all vaults between STX and CHA
      const stxChaVaults = Array.from(Dexterity.getVaultsForToken(STX_TOKEN).values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));

      // Check CHA node has edges to all vaults
      const chaEdges = Array.from(chaNode?.edges.values() || [])
        .filter(edge => edge.target.contractId === STX_TOKEN);
      expect(chaEdges.length).toBe(stxChaVaults.length);

      // Check STX node has edges to all vaults
      const stxEdges = Array.from(stxNode?.edges.values() || [])
        .filter(edge => edge.target.contractId === CHA_TOKEN);
      expect(stxEdges.length).toBe(stxChaVaults.length);

      // Verify all vault IDs are present
      const vaultIds = stxChaVaults.map(v => v.contractId);
      expect(chaEdges.every(e => vaultIds.includes(e.vault.contractId))).toBe(true);
      expect(stxEdges.every(e => vaultIds.includes(e.vault.contractId))).toBe(true);
    });

    it("should have correct edge properties for all vaults", () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      const chaNode = Router.nodes.get(CHA_TOKEN);
      const edges = Array.from(chaNode?.edges.values() || [])
        .filter(edge => edge.target.contractId === STX_TOKEN);

      for (const edge of edges) {
        expect(edge.liquidity).toBeGreaterThanOrEqual(0);
        expect(edge.target.contractId).toBe(STX_TOKEN);
      }
    });

    it("should return correct graph statistics", () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      const stats = Router.getGraphStats();
      const stxChaVaults = Array.from(Dexterity.getVaultsForToken(STX_TOKEN).values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));

      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.edgeCount).toBeGreaterThanOrEqual(stxChaVaults.length * 2); // Edges in both directions
      expect(stats.tokenIds).toContain(CHA_TOKEN);
      expect(stats.tokenIds).toContain(STX_TOKEN);
    });
  });
}); 