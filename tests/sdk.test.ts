import { describe, it, expect, beforeAll } from "vitest";
import { DexteritySDK, scanVaults } from "../src/index";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { LPToken } from "../src/types";

describe("DexteritySDK", () => {
  let sdk: DexteritySDK;
  const testAddress = "ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR";
  const network = STACKS_TESTNET;

  // Sample token and pool data
  const charismaToken = {
    contractId: `${testAddress}.charisma`,
    identifier: "charisma",
    name: "Charisma Token",
    symbol: "CHA",
    decimals: 6,
    supply: 100000000,
  };

  const dmeToken = {
    contractId: `${testAddress}.dme000-governance-token`,
    identifier: "charisma",
    name: "Governance Token",
    symbol: "DMG",
    decimals: 6,
    supply: 100000000,
  };

  // Sample pool data
  const testPool: LPToken = {
    contractId: `${testAddress}.lp-token-rc4`,
    liquidity: [
      {
        token: charismaToken,
        reserves: 1000000,
      },
      {
        token: dmeToken,
        reserves: 1000000,
      },
    ],
    symbol: "DEX",
    name: "Dexterity",
    decimals: 6,
    identifier: "DEX",
    supply: 1000000,
    fee: 3000,
  };

  beforeAll(async () => {
    // Initialize SDK with test configuration
    sdk = new DexteritySDK({
      network,
      stxAddress: testAddress,
      defaultSlippage: 0.5,
    });

    // Initialize SDK (this will discover vaults and build the graph)
    const vaults = await scanVaults({ network: STACKS_TESTNET });
    await sdk.initializeWithVaults(vaults);
  });

  describe("Initialization", () => {
    it("should initialize successfully", () => {
      expect(sdk.isInitialized()).toBe(true);
    });

    it("should throw error if trying to swap before initialization", async () => {
      const uninitializedSdk = new DexteritySDK({
        network,
        stxAddress: testAddress,
      });

      await expect(
        uninitializedSdk.buildSwap(
          1000000,
          charismaToken.contractId,
          dmeToken.contractId
        )
      ).rejects.toThrow("SDK not initialized");
    });
  });

  describe("Swap Operations", () => {
    it("should build a basic swap transaction", async () => {
      const tx = await sdk.buildSwap(
        1000000, // 1 token
        charismaToken.contractId,
        dmeToken.contractId
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("swap-1");
    });

    it("should build a swap with custom options", async () => {
      const tx = await sdk.buildSwap(
        1000000,
        charismaToken.contractId,
        dmeToken.contractId,
        {
          slippagePercent: 1,
          maxHops: 2,
          deadline: Date.now() + 3600,
        }
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("swap-1");
    });

    it("should build a swap with custom path", async () => {
      const tx = await sdk.buildSwap(
        1000000,
        charismaToken.contractId,
        dmeToken.contractId,
        {
          customPath: [charismaToken.contractId, dmeToken.contractId],
        }
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("swap-1");
    });

    it("should get a quote for a swap", async () => {
      const quote = await sdk.getQuote(
        charismaToken.contractId,
        dmeToken.contractId,
        1000000
      );

      expect(quote).toBeDefined();
      expect(quote.route).toBeDefined();
      expect(quote.quote.amountIn).toBe(1000000);
      expect(quote.quote.amountOut).toBeGreaterThanOrEqual(0);
      expect(quote.quote.path).toContain(charismaToken.contractId);
      expect(quote.quote.path).toContain(dmeToken.contractId);
    });
  });

  describe("Liquidity Operations", () => {
    it("should build an add liquidity transaction", async () => {
      const tx = await sdk.buildAddLiquidity(
        testPool.contractId,
        1000000 // 1 token worth
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("execute");
    });

    it("should build a remove liquidity transaction", async () => {
      const tx = await sdk.buildRemoveLiquidity(
        testPool.contractId,
        1000000 // 1 LP token
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("execute");
    });

    it("should build liquidity operations with custom slippage", async () => {
      const tx = await sdk.buildAddLiquidity(testPool.contractId, 1000000, {
        slippagePercent: 1,
      });

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.functionName).toBe("execute");
    });
  });

  describe("Error Handling", () => {
    it("should throw error for invalid token paths", async () => {
      await expect(
        sdk.buildSwap(1000000, "invalid.token", dmeToken.contractId)
      ).rejects.toThrow();
    });

    it("should throw error for invalid pool ID", async () => {
      await expect(
        sdk.buildAddLiquidity("invalid.pool", 1000000)
      ).rejects.toThrow();
    });

    it("should throw error for invalid custom path", async () => {
      await expect(
        sdk.buildSwap(1000000, charismaToken.contractId, dmeToken.contractId, {
          customPath: ["invalid.token", dmeToken.contractId],
        })
      ).rejects.toThrow();
    });
  });
}, 50000);
