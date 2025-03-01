import { generateWallet } from "@stacks/wallet-sdk";
import { Dexterity } from "../src/core/sdk";
import { describe, it, expect, beforeEach, afterAll } from "vitest";

describe("SDK Configuration", () => {
  // Save original config and env vars
  const originalConfig = { ...Dexterity.config };
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.HIRO_API_KEY;
    delete process.env.HIRO_API_KEYS;
    // Reset to original config
    await await Dexterity.configure(originalConfig);
  });

  afterAll(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  // it('should generate private key from seed phrase', async () => {
  //   const wallet = await generateWallet({
  //     secretKey: '',
  //     password: "",
  //   });
  //   console.log(wallet.accounts[0].stxPrivateKey)
  // });

  it("should accept partial config updates", async () => {
    const currentConfig = Dexterity.config;
    const newMaxHops = 4;

    await await Dexterity.configure({ maxHops: newMaxHops });

    const updatedConfig = Dexterity.config;
    expect(updatedConfig.maxHops).toBe(newMaxHops);
    expect(updatedConfig.defaultSlippage).toBe(currentConfig.defaultSlippage);
    expect(updatedConfig.network).toBe(currentConfig.network);
  });

  it("should handle multiple partial updates", async () => {
    await Dexterity.configure({ maxHops: 2 });
    await Dexterity.configure({ defaultSlippage: 0.01 });

    const config = Dexterity.config;
    expect(config.maxHops).toBe(2);
    expect(config.defaultSlippage).toBe(0.01);
  });

  it("should validate partial updates", async () => {
    await expect(
      Dexterity.configure({ maxHops: 10 })
    ).rejects.toThrow();

    await expect(
      Dexterity.configure({ defaultSlippage: 1.1 })
    ).rejects.toThrow();
  });

  it("should handle network updates", async () => {
    const currentConfig = Dexterity.config;
    expect(currentConfig.network).toBe('mainnet');

    await Dexterity.configure({ network: 'mainnet' });
    expect(Dexterity.config.network).toBe('mainnet');
  });

  it("should prioritize runtime config over environment", async () => {
    process.env.HIRO_API_KEY = "env-api-key";
    await Dexterity.configure({ apiKey: "runtime-key" });

    const config = Dexterity.config;
    expect(config.apiKey).toBe("runtime-key");
  });
});