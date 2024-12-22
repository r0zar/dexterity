// tests/sdk.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import "dotenv/config";
import { Dexterity } from "../src/core/sdk";
import {
  DexterityError,
  LPToken,
  Quote,
  Token,
  TransactionConfig,
} from "../src/types";
import { ERROR_CODES } from "../src/constants";

// Test data
const TEST_ADDRESS = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";
const INVALID_TOKEN: Token = {
  contractId: "SP000000000000000000002Q6VF78.token-xyz",
  identifier: "xyz",
  name: "XYZ Token",
  symbol: "XYZ",
  decimals: 6,
};

describe("Dexterity SDK", () => {
  let pools: LPToken[] = [];
  let fromToken: Token;
  let toToken: Token;

  beforeAll(async () => {
    const initResult = await Dexterity.initialize();
    expect(initResult.isOk()).toBe(true);

    Dexterity.config.stxAddress = TEST_ADDRESS;

    for (const vault of Dexterity.router.vaults.values()) {
      pools.push(vault.getPool());
    }

    expect(pools.length).toBeGreaterThan(0);
    fromToken = pools[0].liquidity[0];
    toToken = pools[0].liquidity[1];
  });

  it("should initialize successfully", () => {
    expect(Dexterity.isInitialized()).toBe(true);
    expect(Dexterity.config.stxAddress).toBe(TEST_ADDRESS);
    expect(Dexterity.router.vaults.size).toBeGreaterThan(0);
  });

  it("should get direct swap quote", async () => {
    const quoteResult = await Dexterity.getQuote(fromToken, toToken, 1000000);
    expect(quoteResult.isOk()).toBe(true);

    const quote = quoteResult.unwrap();
    expect(quote.amountIn).toBe(1000000);
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should get multi-hop quote", async () => {
    const multiHopQuote = await Dexterity.getQuote(
      pools[0].liquidity[0],
      pools[1].liquidity[1],
      10000000
    );
    expect(multiHopQuote.isOk()).toBe(true);

    const quote = multiHopQuote.unwrap();
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should build direct swap transaction", async () => {
    const swapResult = await Dexterity.buildSwap(
      pools[0].liquidity[0],
      pools[0].liquidity[1],
      1000
    );
    expect(swapResult.isOk()).toBe(true);

    const tx = swapResult.unwrap() as TransactionConfig;
    expect(tx).toHaveProperty("functionName", "execute");
    expect(tx).toHaveProperty("postConditions");
    expect(tx.postConditions).toBeInstanceOf(Array);
    expect(tx.functionArgs).toHaveLength(2);

    // Validate opcode format
    const [amountArg, opcodeArg] = tx.functionArgs;
    expect(opcodeArg).toMatch(/^0x[0-9a-f]+$/); // Hex string
    expect(opcodeArg.length).toBeLessThan(40); // Reasonable length
  });

  it("should build multi-hop swap transaction", async () => {
    const multiHopSwap = await Dexterity.buildSwap(
      pools[0].liquidity[0],
      pools[1].liquidity[1],
      10000
    );
    expect(multiHopSwap.isOk()).toBe(true);

    const tx = multiHopSwap.unwrap() as TransactionConfig;
    expect(tx).toHaveProperty("functionName");
    expect(tx.functionName).toMatch(/^swap-/);
    expect(tx.postConditions.length).toBeGreaterThanOrEqual(2);
  });

  it("should get vaults for tokens", () => {
    const stxVaults = Dexterity.getVaultsForToken(".stx");
    expect(stxVaults.size).toBeGreaterThan(0);

    const usdaVaults = Dexterity.getVaultsForToken(
      "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda"
    );
    expect(usdaVaults.size).toBeGreaterThan(0);
  });

  describe("Edge Cases", () => {
    it("should handle small amounts", async () => {
      const smallQuote = await Dexterity.getQuote(
        pools[0].liquidity[0],
        pools[0].liquidity[1],
        100
      );
      expect(smallQuote.isOk()).toBe(true);

      const quote = smallQuote.unwrap();
      expect(quote.amountOut).toBeGreaterThan(0);
    });

    it("should handle large amounts", async () => {
      const largeQuote = await Dexterity.getQuote(
        pools[0].liquidity[0],
        pools[0].liquidity[1],
        1000000000000
      );
      expect(largeQuote.isOk()).toBe(true);
    });

    it("should handle invalid paths", async () => {
      const invalidQuote = await Dexterity.getQuote(
        INVALID_TOKEN,
        pools[0].liquidity[1],
        1000000
      );
      expect(invalidQuote.isErr()).toBe(true);
      const error = invalidQuote.unwrap() as unknown as DexterityError;
      expect(error.code).toBe(ERROR_CODES.INVALID_PATH);
    });
  });
});
