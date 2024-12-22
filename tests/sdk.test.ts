import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { LPToken, Token } from "../src/types";

// Test data
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

    for (const vault of Dexterity.router.vaults.values()) {
      pools.push(vault.getPool());
    }

    expect(pools.length).toBeGreaterThan(0);
    fromToken = pools[0].liquidity[0];
    toToken = pools[0].liquidity[1];
  }, 200000);

  it("should initialize successfully", () => {
    expect(Dexterity.isInitialized()).toBe(true);
    expect(Dexterity.router.vaults.size).toBeGreaterThan(0);
  });

  it("should get direct swap quote", async () => {
    const quoteResult = await Dexterity.getQuote(
      fromToken.contractId,
      toToken.contractId,
      1000000
    );
    expect(quoteResult.isOk()).toBe(true);

    const quote = quoteResult.unwrap();
    expect(quote.amountIn).toBe(1000000);
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should get multi-hop quote", async () => {
    const multiHopQuote = await Dexterity.getQuote(
      pools[0].liquidity[0].contractId,
      pools[1].liquidity[1].contractId,
      10000000
    );
    expect(multiHopQuote.isOk()).toBe(true);

    const quote = multiHopQuote.unwrap();
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should build direct swap transaction", async () => {
    const swapConfig = await Dexterity.buildSwap(
      pools[0].liquidity[0].contractId,
      pools[0].liquidity[1].contractId,
      1000
    );

    expect(swapConfig).toHaveProperty("functionName", "swap-1");
    expect(swapConfig).toHaveProperty("postConditions");
    expect(swapConfig.postConditions).toBeInstanceOf(Array);
    expect(swapConfig.functionArgs).toHaveLength(2);

    // Validate opcode format
    const [amountArg, opcodeArg] = swapConfig.functionArgs;
    expect(amountArg).toBeTypeOf("object"); // clarity value
    expect(opcodeArg).toBeTypeOf("object"); // clarity value
  });

  it("should build multi-hop swap transaction", async () => {
    const multiHopSwapConfig = await Dexterity.buildSwap(
      pools[0].liquidity[0].contractId,
      pools[1].liquidity[1].contractId,
      10000
    );

    expect(multiHopSwapConfig).toHaveProperty("functionName");
    expect(multiHopSwapConfig.functionName).toMatch(/^swap-/);
    expect(multiHopSwapConfig.postConditions.length).toBeGreaterThanOrEqual(2);
  });

  it("should get vaults for tokens", () => {
    const stxVaults = Dexterity.getVaultsForToken(".stx");
    expect(stxVaults.size).toBeGreaterThan(0);

    const chaVaults = Dexterity.getVaultsForToken(
      "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token"
    );
    expect(chaVaults.size).toBeGreaterThan(0);
  });

  describe("Edge Cases", () => {
    it("should handle small amounts", async () => {
      const smallQuote = await Dexterity.getQuote(
        pools[0].liquidity[0].contractId,
        pools[0].liquidity[1].contractId,
        10
      );
      expect(smallQuote.isOk()).toBe(true);
      const quote = smallQuote.unwrap();
      expect(quote.amountOut).toBeGreaterThan(0);
    });
    it("should handle large amounts", async () => {
      const largeQuote = await Dexterity.getQuote(
        pools[0].liquidity[0].contractId,
        pools[0].liquidity[1].contractId,
        1000000000
      );
      expect(largeQuote.isOk()).toBe(true);
    });
    it("should handle invalid paths", async () => {
      const invalidQuote = await Dexterity.getQuote(
        INVALID_TOKEN.contractId,
        pools[0].liquidity[1].contractId,
        1000
      );
      expect(invalidQuote.isErr()).toBe(true);
    });
  });

  // describe("Transaction Execution", async () => {
  //   it("should execute swap transaction", async () => {
  //     const response = await Dexterity.executeSwap(
  //       pools[1].liquidity[1].contractId,
  //       pools[1].liquidity[0].contractId,
  //       1000000
  //     );
  //     console.log({ response });
  //   });
  // });
}, 200000);
