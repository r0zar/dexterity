import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Router } from "../src/core/router";
import { Opcode } from "../src/core/opcode";

const DMG_TOKEN = "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token";
const SKULL_TOKEN = "SP3BRXZ9Y7P5YP28PSR8YJT39RT51ZZBSECTCADGR.skullcoin-stxcity";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";
const STX_TOKEN = ".stx";

describe("Dexterity SDK - Multi-hop Operations", () => {
  beforeAll(async () => {
    await Dexterity.configure({debug: true});
    await Dexterity.discover({reserves: false}); // Need full pool discovery for multi-hop
  }, 200000);

  describe("Pool Discovery", () => {
    it("should discover multiple pools for same token pairs", async () => {
      const stxVaults = Dexterity.getVaultsForToken(STX_TOKEN);
      const chaVaults = Dexterity.getVaultsForToken(CHA_TOKEN);
      
      // Find vaults that have both tokens
      const commonVaults = Array.from(stxVaults.values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));
      
      expect(commonVaults.length).toBeGreaterThan(1);
    });
  });



  describe("Path Finding", () => {
    it("should find all available paths between tokens", () => {
      const paths = Router.findAllPaths(CHA_TOKEN, STX_TOKEN);
      const stxChaVaults = Array.from(Dexterity.getVaultsForToken(STX_TOKEN).values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));
      
      paths.forEach(path => {
        expect(path.length).toBeGreaterThan(1);
        expect(path[0].contractId).toBe(CHA_TOKEN);
        expect(path[path.length - 1].contractId).toBe(STX_TOKEN);
      });
    });

    it("should select best vault based on output amount", async () => {
      const testAmount = 1000000;
      const quote = await Dexterity.getQuote(STX_TOKEN, CHA_TOKEN, testAmount);
      
      // Get all vaults between STX and CHA
      const stxChaVaults = Array.from(Dexterity.getVaultsForToken(STX_TOKEN).values())
        .filter(vault => vault.getTokens().some(t => t.contractId === CHA_TOKEN));
      
      // Get quotes from each vault
      const quotes = await Promise.all(stxChaVaults.map(async vault => {
        const vaultQuote = await vault.quote(testAmount, Opcode.swapExactAForB());
        return {
          vault: vault.contractId,
          amountOut: vaultQuote instanceof Error ? 0 : vaultQuote.amountOut
        };
      }));

      // Find best quote
      const bestVaultId = quotes.reduce((best, current) => 
        current.amountOut > best.amountOut ? current : best
      ).vault;

      // Router should select the vault with best quote
      expect(quote.route.hops[0].vault.contractId).toBe(bestVaultId);
    });
  });

  describe("Multi-hop Routing", () => {
    it("should get multi-hop quote with best vaults", async () => {
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