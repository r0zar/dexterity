import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Vault } from "../src/core/vault";
import { Opcode } from "../src/core/opcode";
import { Quote } from "../src/types";

describe("Vaults", async () => {
  let testVault: Vault;

  beforeAll(async () => {
    Dexterity.configure({debug: true});
    // Initialize with a known test pool
    const cvltVault = await Vault.build("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-cha-vault-wrapper-alex");
    if (!cvltVault) {
      throw new Error("Failed to initialize test vault");
    }
    testVault = cvltVault;
  });

  describe("Pool State", () => {
    it("should get pool reserves", async () => {
      const [reserve0, reserve1] = testVault.getReserves();
      expect(reserve0).toBeTypeOf("number");
      expect(reserve1).toBeTypeOf("number");
      expect(reserve0).toBeGreaterThan(0);
      expect(reserve1).toBeGreaterThan(0);
    });

    it("should get pool tokens", () => {
      const [token0, token1] = testVault.getTokens();
      expect(token0).toHaveProperty("contractId");
      expect(token1).toHaveProperty("contractId");
      expect(token0).toHaveProperty("symbol");
      expect(token1).toHaveProperty("symbol");
    });

    it("should get pool fee", () => {
      const fee = testVault.getFee();
      expect(fee).toBeTypeOf("number");
      expect(fee).toBeGreaterThan(0);
      expect(fee).toBeLessThanOrEqual(1000000); // Max 100%
    });
  });

  describe("Reserve Operations", () => {
    it("should get reserves using opcode", async () => {
      const quote = await testVault.quote(0, Opcode.lookupReserves()) as Quote;
      expect(quote).toHaveProperty("amountIn");
      expect(quote).toHaveProperty("amountOut");
      expect(quote.amountIn).toBeGreaterThan(0);
      expect(quote.amountOut).toBeGreaterThan(0);
    });

    it("should handle reserve updates", async () => {
      const [initialReserve0, initialReserve1] = testVault.getReserves();
      
      // Simulate a swap that would update reserves
      await testVault.quote(1000000, Opcode.swapExactAForB());
      
      const [newReserve0, newReserve1] = testVault.getReserves();
      expect(newReserve0).toBeTypeOf("number");
      expect(newReserve1).toBeTypeOf("number");
      // Reserves should still be valid numbers
      expect(newReserve0).toBeGreaterThan(0);
      expect(newReserve1).toBeGreaterThan(0);
    });
  });

  describe("Pool Metadata", () => {
    it("should have valid metadata", () => {
      expect(testVault.name).toBeTypeOf("string");
      expect(testVault.symbol).toBeTypeOf("string");
      expect(testVault.contractId).toMatch(/^SP[A-Z0-9]+\.[a-z-]+$/);
    });

    it("should convert to LP token format", () => {
      const lpToken = testVault.toLPToken();
      expect(lpToken).toHaveProperty("contractId");
      expect(lpToken).toHaveProperty("liquidity");
      expect(lpToken.liquidity).toHaveLength(2);
      expect(lpToken).toHaveProperty("fee");
    });
  });

  // describe("Vault Swap Operations", () => {
  //   it("should swap STX for CHA", async () => {
  //     const swapConfig = await testVault.executeTransaction(Opcode.swapExactAForB(), 100000, {
  //       fee: 1000,
  //     });
  //     console.log(swapConfig);
  //     expect(swapConfig).toBeDefined();
  //   });
  // });
});
