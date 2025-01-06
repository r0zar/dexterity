import { Dexterity } from "../src/core/sdk";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { StacksClient } from "../src/utils/client";

describe("SDK Configuration", () => {
  // Save original config and env vars
  const originalConfig = { ...Dexterity.getConfig() };
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    delete process.env.HIRO_API_KEY;
    delete process.env.HIRO_API_KEYS;
    // Reset to original config
    Dexterity.setConfig(originalConfig);
  });

  afterAll(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it("should accept partial config updates", () => {
    const currentConfig = Dexterity.getConfig();
    const newMaxHops = 4;

    Dexterity.setConfig({ maxHops: newMaxHops });

    const updatedConfig = Dexterity.getConfig();
    expect(updatedConfig.maxHops).toBe(newMaxHops);
    expect(updatedConfig.defaultSlippage).toBe(currentConfig.defaultSlippage);
    expect(updatedConfig.network).toBe(currentConfig.network);
  });

  it("should handle multiple partial updates", () => {
    Dexterity.setConfig({ maxHops: 2 });
    Dexterity.setConfig({ defaultSlippage: 1 });
    
    const config = Dexterity.getConfig();
    expect(config.maxHops).toBe(2);
    expect(config.defaultSlippage).toBe(1);
  });

  it("should validate partial updates", () => {
    expect(() => {
      Dexterity.setConfig({ maxHops: 10 });
    }).toThrow();

    expect(() => {
      Dexterity.setConfig({ defaultSlippage: 101 });
    }).toThrow();
  });

  it("should handle network updates", () => {
    const currentConfig = Dexterity.getConfig();
    expect(currentConfig.network).toBe(STACKS_MAINNET);

    Dexterity.setConfig({ network: STACKS_TESTNET });
    expect(Dexterity.getConfig().network).toBe(STACKS_TESTNET);
  });

  it("should prioritize runtime config over environment", () => {
    process.env.HIRO_API_KEY = "env-api-key";
    Dexterity.setConfig({ apiKey: "runtime-key" });
    
    const config = Dexterity.getConfig();
    expect(config.apiKey).toBe("runtime-key");
  });

  // Type tests
  it("should enforce type safety", () => {
    // @ts-expect-error - Invalid property
    Dexterity.setConfig({ invalidProperty: "test" });

    // @ts-expect-error - Invalid type for maxHops
    Dexterity.setConfig({ maxHops: "3" });

    // Valid updates should compile
    Dexterity.setConfig({ mode: "client" });
    Dexterity.setConfig({ maxHops: 3 });
  });
});