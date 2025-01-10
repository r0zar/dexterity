import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Router } from "../src/core/router";
import { Opcode } from "../src/core/opcode";

// Test data - we'll get actual tokens from router
const STX_TOKEN = ".stx";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";

describe("Dexterity SDK - Basic Operations", () => {
  beforeAll(async () => {
    await Dexterity.configure({debug: true});
    await Dexterity.discover(); // Discover all pools
  }, 200000);

  it("should discover pools", async () => {
    const vaults = Dexterity.getVaults();
    expect(vaults.length).toBeGreaterThan(0);
  });

  it("should get direct swap quote", async () => {
    const quote = await Dexterity.getQuote(STX_TOKEN, CHA_TOKEN, 1000000);
    expect(quote.amountIn).toBe(1000000);
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should build direct swap transaction", async () => {
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

  describe("Graph Structure", () => {
    it("should create correct graph nodes", () => {
      const nodes = Router.nodes;
      const tokens = [CHA_TOKEN, STX_TOKEN];
      
      for (const tokenId of tokens) {
        expect(nodes.has(tokenId)).toBe(true);
        const node = nodes.get(tokenId);
        expect(node?.token.contractId).toBe(tokenId);
      }
    });

    it("should create correct graph edges for multiple vaults", () => {
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
      const chaNode = Router.nodes.get(CHA_TOKEN);
      const edges = Array.from(chaNode?.edges.values() || [])
        .filter(edge => edge.target.contractId === STX_TOKEN);
      
      for (const edge of edges) {
        expect(edge.liquidity).toBeGreaterThan(0);
        expect(edge.target.contractId).toBe(STX_TOKEN);
      }
    });

    it("should return correct graph statistics", () => {
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