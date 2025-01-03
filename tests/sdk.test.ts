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

const CHA_TOKEN = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token';
const DMG_TOKEN = 'SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token';
const SKULL_TOKEN = 'SP3BRXZ9Y7P5YP28PSR8YJT39RT51ZZBSECTCADGR.skullcoin-stxcity'

describe("Dexterity SDK", () => {
  let pools: LPToken[] = [];

  beforeAll(async () => {
    await Dexterity.deriveSigner(0);
    await Dexterity.discoverPools();
    for (const vault of Dexterity.router.vaults.values()) {
      pools.push(vault.getPool());
    }
  }, 200000);

  it("should get direct swap quote", async () => {
    const quote = await Dexterity.getQuote(
      CHA_TOKEN,
      DMG_TOKEN,
      1000000
    );
    expect(quote.amountIn).toBe(1000000);
    expect(quote.amountOut).toBeGreaterThan(0);
  });

  it("should get multi-hop quote", async () => {
    const quote = await Dexterity.getQuote(
      DMG_TOKEN,
      SKULL_TOKEN,
      10000000
    );

    expect(quote.amountOut).toBeGreaterThan(0);
  });

  // it("should build direct swap transaction", async () => {
  //   const swapConfig = await Dexterity.buildSwap(
  //     CHA_TOKEN,
  //     DMG_TOKEN,
  //     1000
  //   );

  //   expect(swapConfig).toHaveProperty("functionName");
  //   expect(swapConfig.functionName).toMatch(/^swap-/);
  //   expect(swapConfig).toHaveProperty("postConditions");
  //   expect(swapConfig.postConditions).toBeInstanceOf(Array);
  //   expect(swapConfig.functionArgs).toHaveLength(2);

  //   // Validate opcode format
  //   const [amountArg, opcodeArg] = swapConfig.functionArgs;
  //   expect(amountArg).toBeTypeOf("object"); // clarity value
  //   expect(opcodeArg).toBeTypeOf("object"); // clarity value
  // });

  // it("should build multi-hop swap transaction", async () => {
  //   const multiHopSwapConfig = await Dexterity.buildSwap(
  //     CHA_TOKEN,
  //     SKULL_TOKEN,
  //     10000
  //   );

  //   expect(multiHopSwapConfig).toHaveProperty("functionName");
  //   expect(multiHopSwapConfig.functionName).toMatch(/^swap-/);
  //   expect(multiHopSwapConfig.postConditions.length).toBeGreaterThanOrEqual(2);
  // });

  // it("should get tokens", () => {
  //   const tokens = Dexterity.getTokens();
  //   expect(tokens.length).toBeGreaterThan(0);
  // });

  // it("should get token info", async () => {
  //   const token = await Dexterity.getTokenInfo(
  //     "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token"
  //   );
  //   expect(token).toHaveProperty("name");
  //   expect(token).toHaveProperty("symbol");
  //   expect(token).toHaveProperty("decimals");
  // });

  // it("should get token decimals", async () => {
  //   const decimals = await Dexterity.client.getTokenDecimals(
  //     "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token"
  //   );
  //   expect(decimals).toEqual(6);
  // });

  // it("should get token name", async () => {
  //   const name = await Dexterity.client.getTokenName(
  //     "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token"
  //   );
  //   expect(name).toBe("Charisma");
  // });

  // it("should get token metadata", async () => {
  //   const metadata = await Dexterity.client.getTokenMetadata(
  //     "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token"
  //   );
  //   expect(metadata).toHaveProperty("image");
  // });

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
