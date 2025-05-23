import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Router } from "../src/core/router";

const DMG_TOKEN = "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token";
const SKULL_TOKEN = "SP3BRXZ9Y7P5YP28PSR8YJT39RT51ZZBSECTCADGR.skullcoin-stxcity";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";
const STX_TOKEN = ".stx";

// Check if we're running in CI environment
const isCI = process.env.CI === 'true';

describe("Dexterity SDK - Multi-hop Operations", () => {
  let skipNetworkTests = false;

  beforeAll(async () => {
    try {
      await Dexterity.configure({debug: true});
      await Dexterity.discover({
        reserves: false, 
        continueOnError: true // Continue even if some pools fail to load
      }); // Need full pool discovery for multi-hop
    } catch (error) {
      console.warn("Network-dependent tests will be skipped due to connection issues:", error);
      skipNetworkTests = true;
    }
  }, 200000);

  describe("Pool Discovery", () => {
    it("should discover multiple pools for same token pairs", async () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      
      const stxVaults = Dexterity.getVaultsForToken(STX_TOKEN);
      
      // Find vaults that have both tokens
      const commonVaults = Array.from(stxVaults.values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));
      
      expect(commonVaults.length).toBeGreaterThan(1);
    });
  });

  describe("Path Finding", () => {
    it("should find all available paths between tokens", () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      
      const paths = Router.findAllPaths(CHA_TOKEN, STX_TOKEN);
      const stxChaVaults = Array.from(Dexterity.getVaultsForToken(STX_TOKEN).values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));
      
      paths.forEach(path => {
        expect(path.length).toBeGreaterThan(1);
        expect(path[0].contractId).toBe(CHA_TOKEN);
        expect(path[path.length - 1].contractId).toBe(STX_TOKEN);
      });
    });
  });

  describe("Multi-hop Routing", () => {
    it("should get multi-hop quote with best vaults", async () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      
      const quote = await Dexterity.getQuote(DMG_TOKEN, SKULL_TOKEN, 10000000);
      expect(quote.amountOut).toBeGreaterThan(0);
      expect(quote.route.hops.length).toBeGreaterThan(1);

      // Verify each hop uses the best vault
      for (let i = 0; i < quote.route.hops.length; i++) {
        const hop = quote.route.hops[i];
        const node = Router.nodes.get(hop.tokenIn.contractId);
        
        // Get all possible vaults for this hop
        const availableEdges = Array.from(node?.edges.values() || [])
          .filter(edge => edge.target.contractId === hop.tokenOut.contractId);

        // Get quotes from all possible vaults
        const hopQuotes = await Promise.all(availableEdges.map(async edge => {
          const quote = await edge.vault.quote(hop.quote!.amountIn, hop.opcode);
          return {
            vault: edge.vault.contractId,
            amountOut: quote instanceof Error ? 0 : quote.amountOut
          };
        }));

        // Find best vault
        const bestVaultId = hopQuotes.reduce((best, current) => 
          current.amountOut > best.amountOut ? current : best
        ).vault;

        // Verify router chose the best vault
        expect(hop.vault.contractId).toBe(bestVaultId);
      }
    });

    it("should build multi-hop swap transaction with correct vaults", async () => {
      if (skipNetworkTests || isCI) {
        return;
      }
      
      const multiHopSwapConfig = await Dexterity.buildSwap(
        CHA_TOKEN,
        SKULL_TOKEN,
        10000
      );

      expect(multiHopSwapConfig).toHaveProperty("functionName");
      expect(multiHopSwapConfig.functionName).toMatch(/^swap-/);
      expect(multiHopSwapConfig.postConditions.length).toBeGreaterThanOrEqual(2);
    });
  });
});