import { describe, it, expect, beforeAll } from "vitest";
import { DexteritySDK } from "../src/index";
import { Presets } from "../src/lib/opcode";
import { STACKS_TESTNET } from "@stacks/network";

describe("DexteritySDK", () => {
  let sdk: DexteritySDK;
  const testAddress = "ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR";
  const network = STACKS_TESTNET;

  // Sample pool data
  const testPool = {
    contractId: `${testAddress}.lp-token-rc4`,
    token0: {
      contractId: `${testAddress}.charisma`,
      metadata: {
        symbol: "CHA",
        name: "Charisma Token",
        decimals: 6,
        identifier: "charisma",
      },
    },
    token1: {
      contractId: `${testAddress}.dme000-governance-token`,
      metadata: {
        symbol: "DMG",
        name: "Governance Token",
        decimals: 6,
        identifier: "charisma",
      },
    },
    poolData: {
      reserve0: 1000000,
      reserve1: 1000000,
      totalSupply: 1000000,
      fee: 3000,
    },
    metadata: {
      symbol: "DEX",
      name: "Dexterity",
      decimals: 6,
      identifier: "DEX",
    },
  };

  beforeAll(() => {
    sdk = new DexteritySDK(network, testAddress);
  });

  describe("Transaction Building", () => {
    it("should build a swap transaction", async () => {
      const tx = await sdk.buildSwapTransaction(
        testPool,
        1000000, // 1 STX
        Presets.swapExactAForB()
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.contractAddress).toBe(testAddress);
      expect(tx.functionName).toBe("execute");
    });

    it("should build an add liquidity transaction", async () => {
      const tx = await sdk.buildAddLiquidityTransaction(
        testPool,
        1000000, // 1 STX worth
        Presets.addBalancedLiquidity()
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.contractAddress).toBe(testAddress);
      expect(tx.functionName).toBe("execute");
    });

    it("should build a remove liquidity transaction", async () => {
      const tx = await sdk.buildRemoveLiquidityTransaction(
        testPool,
        1000000, // 1 LP token
        Presets.removeLiquidity()
      );

      expect(tx).toBeDefined();
      expect(tx.network).toBe(network);
      expect(tx.contractAddress).toBe(testAddress);
      expect(tx.functionName).toBe("execute");
    });
  });
});
