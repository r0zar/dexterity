import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Vault } from "../src/core/vault";
import { Router } from "../src/core/router";
import { Opcode } from "../src/core/opcode";

// Test data
const STX_TOKEN = ".stx";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";

describe("Dexterity SDK - Basic Operations", () => {
  let pools: Partial<Vault>[] = [];

  beforeAll(async () => {
    await Dexterity.configure({debug: true});
    
    // Only discover the specific pool we need
    const poolId = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-cha-vault-wrapper-alex";
    const poolId2 = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-flow"
    const vault = await Vault.build(poolId);
    const vault2 = await Vault.build(poolId2);
    if (vault && vault2) {
      Dexterity.router.loadVaults([vault, vault2]);
      pools.push(vault.toLPToken());
      pools.push(vault2.toLPToken());
    }
  }, 200000);

  it("should discover specific pool", async () => {
    console.log(Dexterity.router.edges)
    expect(pools.length).toBe(2);
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
    expect(swapConfig.functionArgs).toHaveLength(2);

    // Validate opcode format
    const [amountArg, opcodeArg] = swapConfig.functionArgs;
    expect(amountArg).toBeTypeOf("object"); // clarity value
    expect(opcodeArg).toBeTypeOf("object"); // clarity value
  });

  it("should get tokens", () => {
    const tokens = Dexterity.getTokens();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("should get token info", async () => {
    const token = await Dexterity.getTokenInfo(CHA_TOKEN);
    expect(token).toHaveProperty("name");
    expect(token).toHaveProperty("symbol");
    expect(token).toHaveProperty("decimals");
  });

  it("should get token decimals", async () => {
    const decimals = await Dexterity.client.getTokenDecimals(CHA_TOKEN);
    expect(decimals).toEqual(6);
  });

  it("should get token name", async () => {
    const name = await Dexterity.client.getTokenName(CHA_TOKEN);
    expect(name).toBe("Charisma");
  });

  it("should get token metadata", async () => {
    const metadata = await Dexterity.client.getTokenMetadata(CHA_TOKEN);
    expect(metadata).toHaveProperty("image");
  });

  describe("Graph Structure", () => {
    it("should create correct graph nodes", () => {
      const nodes = Router.nodes;
      const tokens = [CHA_TOKEN, STX_TOKEN];
      
      // Verify nodes exist for both tokens
      for (const tokenId of tokens) {
        expect(nodes.has(tokenId)).toBe(true);
        const node = nodes.get(tokenId);
        expect(node?.token.contractId).toBe(tokenId);
      }
    });

    it("should create correct graph edges", () => {
      const chaNode = Router.nodes.get(CHA_TOKEN);
      const stxNode = Router.nodes.get(STX_TOKEN);
      
      // Check CHA -> DMG edge
      expect(chaNode?.edges.has(STX_TOKEN)).toBe(true);
      const chaEdge = chaNode?.edges.get(STX_TOKEN);
      expect(chaEdge?.vault.contractId).toBe(pools[1].contractId);
      
      // Check DMG -> CHA edge
      expect(stxNode?.edges.has(CHA_TOKEN)).toBe(true);
      const stxEdge = stxNode?.edges.get(CHA_TOKEN);
      expect(stxEdge?.vault.contractId).toBe(pools[1].contractId);
    });

    it("should have correct edge properties", () => {
      const chaNode = Router.nodes.get(CHA_TOKEN);
      const edge = chaNode?.edges.get(STX_TOKEN);
      
      expect(edge).toBeDefined();
      expect(edge?.liquidity).toBeGreaterThan(0);
      expect(edge?.target.contractId).toBe(STX_TOKEN);
    });

    it("should return correct graph statistics", () => {
      const stats = Router.getGraphStats();
      
      expect(stats.nodeCount).toBe(2); // CHA and DMG
      expect(stats.edgeCount).toBe(2); // Bidirectional edge between CHA-DMG
      expect(stats.tokenIds).toContain(CHA_TOKEN);
      expect(stats.tokenIds).toContain(STX_TOKEN);
    });
  });

  // Add this test to help debug the path finding
  describe("Path Finding", () => {
    it("should find direct path between tokens", () => {
      const paths = Router.findAllPaths(CHA_TOKEN, STX_TOKEN);
      expect(paths.length).toBeGreaterThan(0);
      console.log(paths);
      
      // Log the first path for debugging
      const firstPath = paths[0];
      expect(firstPath.length).toBe(2); // Should be 2 tokens for direct path
      expect(firstPath[0].contractId).toBe(CHA_TOKEN);
      expect(firstPath[1].contractId).toBe(STX_TOKEN);
    });

    it("should compare quotes from all STX-CHA vaults", async () => {
      // Get all vaults that have both STX and CHA
      const stxVaults = Dexterity.getVaultsForToken(STX_TOKEN);
      const chaVaults = Dexterity.getVaultsForToken(CHA_TOKEN);
      console.log(stxVaults)
      
      // Find intersection of vaults that have both tokens
      const commonVaults = new Map<string, Vault>();
      stxVaults.forEach((vault, contractId) => {
        if (chaVaults.has(contractId)) {
          commonVaults.set(contractId, vault);
        }
      });

      console.log('Found vaults with STX-CHA:', 
        Array.from(commonVaults.values()).map(v => v.contractId)
      );

      // Get quotes from each vault
      const testAmount = 1000000; // 1 STX
      const quotes = await Promise.all(
        Array.from(commonVaults.values()).map(async vault => {
          const quote = await vault.quote(testAmount, Opcode.swapExactAForB());
          return {
            vault: vault.contractId,
            quote: quote instanceof Error ? null : quote
          };
        })
      );

      console.log('Quote comparison:');
      quotes.forEach(({vault, quote}) => {
        console.log(`${vault}:`, {
          amountIn: testAmount,
          amountOut: quote?.amountOut,
          price: quote ? quote.amountOut / testAmount : 0,
          fee: quote?.fee
        });
      });

      // Verify we got valid quotes
      expect(quotes.some(q => q.quote !== null)).toBe(true);
      
      // Find best quote
      const bestQuote = quotes.reduce((best, current) => {
        if (!current.quote) return best;
        if (!best.quote) return current;
        return current.quote.amountOut > best.quote.amountOut ? current : best;
      });

      console.log('Best quote from:', bestQuote.vault);

      // Verify Router selects the best vault
      const routerQuote = await Dexterity.getQuote(STX_TOKEN, CHA_TOKEN, testAmount);
      expect(routerQuote.route.hops[0].vault.contractId).toBe(bestQuote.vault);
    });
  });
}); 