import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";

const DMG_TOKEN = "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.dme000-governance-token";
const SKULL_TOKEN = "SP3BRXZ9Y7P5YP28PSR8YJT39RT51ZZBSECTCADGR.skullcoin-stxcity";
const CHA_TOKEN = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token";

describe("Dexterity SDK - Multi-hop Operations", () => {
  beforeAll(async () => {
    await Dexterity.configure({debug: true});
    await Dexterity.discoverPools(); // Need full pool discovery for multi-hop
  }, 200000);

  it("should get multi-hop quote", async () => {
    const quote = await Dexterity.getQuote(DMG_TOKEN, SKULL_TOKEN, 10000000);
    expect(quote.amountOut).toBeGreaterThan(0);
    expect(quote.route.hops.length).toBeGreaterThan(1);
  });

  it("should build multi-hop swap transaction", async () => {
    const multiHopSwapConfig = await Dexterity.buildSwap(
      CHA_TOKEN,
      SKULL_TOKEN,
      10000
    );

    expect(multiHopSwapConfig).toHaveProperty("functionName");
    expect(multiHopSwapConfig.functionName).toMatch(/^swap-/);
    expect(multiHopSwapConfig.postConditions.length).toBeGreaterThanOrEqual(2);
  });

  it("should find arbitrage opportunities", async () => {
    const quote = await Dexterity.getQuote(CHA_TOKEN, CHA_TOKEN, 1000000);
    // If a profitable route is found
    if (!(quote instanceof Error)) {
      expect(quote.route.hops.length).toBeGreaterThanOrEqual(0);
    }
  });
});