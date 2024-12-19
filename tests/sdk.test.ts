import { describe, it, expect, beforeAll } from "vitest";
import { DexteritySDK, LPToken } from "../src/index";
import { Presets } from "../src/lib/opcode";
import { STACKS_TESTNET } from "@stacks/network";

describe("DexteritySDK", () => {
  let sdk: DexteritySDK;
  const testAddress = "ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR";
  const network = STACKS_TESTNET;

  // Sample pool data
  const testPool: LPToken = {
    contractId: `${testAddress}.lp-token-rc4`,
    liquidity: [
      {
        token: {
          contractId: `${testAddress}.charisma`,
          identifier: "charisma",
          name: "Charisma Token",
          symbol: "CHA",
          decimals: 6,
          supply: 100000000,
        },
        reserves: 1000000,
      },
      {
        token: {
          contractId: `${testAddress}.dme000-governance-token`,
          identifier: "charisma",
          name: "Governance Token",
          symbol: "DMG",
          decimals: 6,
          supply: 100000000,
        },
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
