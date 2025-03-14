import { describe, it, expect, beforeAll } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Vault } from "../src/core/vault";
import { Opcode } from "../src/core/opcode";
import { Quote } from "../src/types";
import { broadcastTransaction, Cl, cvToHex, makeContractCall, parseToCV, PostConditionMode } from "@stacks/transactions";
import { intCV } from "@stacks/transactions";

describe("Vaults", async () => {
  let testVault;
  beforeAll(async () => {
    await Dexterity.configure({ debug: true });
    console.log(Dexterity.config);
    // Initialize with a known test pool
    testVault = await Vault.build("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-cha-vault-wrapper-alex");
  });

  describe('Data Discovery', () => {
    it('should get token info', async () => {
      const tokenInfo = await Dexterity.getTokenInfo("SP3M31QFF6S96215K4Y2Z9K5SGHJN384NV6YM6VM8.satoshai");
      console.log(tokenInfo);
    });
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

  describe("Contract Generation", () => {
    let baseVault: Vault;

    beforeAll(async () => {
      baseVault = await Vault.build("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.pontis-powerline");
    });

    it("should generate valid contract with basic configuration", () => {
      const contract = baseVault.generateContractCode();

      // Basic structure checks
      expect(contract).toContain("(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait)");
      expect(contract).toContain("(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dexterity-traits-v0.liquidity-pool-trait)");

      // Check token definitions
      expect(contract).toContain(`(define-fungible-token ${baseVault.symbol})`);
      expect(contract).toContain(`(define-constant LP_REBATE u${baseVault.fee})`);
    });

    it("should handle STX token pairs correctly", async () => {
      const stxVault = new Vault({
        contractId: "SP000.test-vault",
        liquidity: [
          { contractId: ".stx", symbol: "STX", decimals: 6, reserves: 1000, name: "STX", identifier: "stx" },
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token", symbol: "TKA", decimals: 6, reserves: 1000, name: "Token A", identifier: "token-a" }
        ],
        name: "Test Vault",
        symbol: "TEST",
        fee: 3000
      });

      const contract = stxVault.generateContractCode();

      // Check STX-specific transfer syntax
      expect(contract).toContain("(try! (stx-transfer?");
      expect(contract).toContain("(stx-get-balance");
    });

    it("should validate token names and symbols for Clarity compatibility", () => {
      const invalidVault = new Vault({
        contractId: "SP000.test-vault",
        name: "k",
        symbol: "T&I",
        fee: 3000,
        liquidity: [
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token", symbol: "TK-A", decimals: 6, reserves: 1000, name: "Token A", identifier: "a" },
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl", symbol: "TK-B", decimals: 6, reserves: 1000, name: "Token B", identifier: "b" }
        ]
      });

      expect(() => invalidVault.generateContractCode()).toThrow();
    });

    it("should validate fee ranges", () => {
      const invalidFeeVault = new Vault({
        contractId: "SP000.test-vault",
        name: "Invalid Fee",
        symbol: "INVF",
        fee: 1000001, // Greater than 100%
        liquidity: [
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token", symbol: "TKA", decimals: 6, reserves: 1000, name: "Token A", identifier: "a" },
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl", symbol: "TKB", decimals: 6, reserves: 1000, name: "Token B", identifier: "b" }
        ]
      });

      expect(() => invalidFeeVault.generateContractCode()).toThrow();
    });

    it("should handle unbalanced initial liquidity correctly", () => {
      const unbalancedVault = new Vault({
        contractId: "SP000.test-vault",
        name: "Unbalanced",
        symbol: "UNBL",
        fee: 3000,
        liquidity: [
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token", symbol: "TKA", decimals: 6, reserves: 1000, name: "Token A", identifier: "a" },
          { contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl", symbol: "TKB", decimals: 6, reserves: 2000, name: "Token B", identifier: "b" }
        ]
      });

      const contract = unbalancedVault.generateContractCode();

      // Should handle additional token transfer for imbalance
      expect(contract).toContain("(try! (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.hooter-the-owl transfer u1000");
    });

    describe("Hold-to-Earn Engine", () => {
      let baseVault: Vault;

      beforeAll(async () => {
        baseVault = await Vault.build("SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charismatic-flow");
      });

      it("should generate valid hold-to-earn contract", () => {
        const contract = baseVault.generateHoldToEarnCode();

        console.log(contract);

        // Check core components
        expect(contract).toContain("(define-data-var first-start-block uint stacks-block-height)");
        expect(contract).toContain("(define-map last-tap-block principal uint)");
        expect(contract).toContain("(define-public (tap)");

        // Check trapezoid calculations
        expect(contract).toContain("(define-private (calculate-trapezoid-areas-39");
        expect(contract).toContain("(define-private (calculate-trapezoid-areas-19");
        expect(contract).toContain("(define-private (calculate-trapezoid-areas-9");
        expect(contract).toContain("(define-private (calculate-trapezoid-areas-5");
        expect(contract).toContain("(define-private (calculate-trapezoid-areas-2");
      });

      // it('should deploy hold-to-earn contract', async () => {
      //   const result = await baseVault.deployHoldToEarnContract();
      //   console.log(result);
      // });
    });
  });

  describe('Prediction Market', async () => {

    it('should get owner', async () => {
      const result = await Dexterity.client.callReadOnly(
        "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.prediction-markets-vault",
        "get-owner",
        [cvToHex(parseToCV("1", "uint128"))]
      );
      console.log(result);
    });

    it('should get market info', async () => {
      const result = await Dexterity.client.callReadOnly(
        "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.prediction-markets-vault",
        "get-market-info",
        [cvToHex(parseToCV("0", "uint128"))]
      );
      console.log(result);
    });

    it('should resolve market', async () => {
      const transaction = await makeContractCall({
        contractAddress: 'SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ',
        contractName: 'prediction-markets-vault',
        functionName: 'resolve-market',
        functionArgs: [Cl.uint(0), Cl.uint(0)],
        postConditionMode: PostConditionMode.Allow,
        senderKey: Dexterity.config.privateKey,
        fee: 1000,
      });
      const result = await broadcastTransaction({ transaction });
      console.log(result);
    });

    it('should quote reward', async () => {
      const result = await Dexterity.client.callReadOnly(
        "SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.prediction-markets-vault",
        "quote-reward",
        [cvToHex(parseToCV("1", "uint128"))]
      );
      console.log(result);
    });

    it('should claim reward', async () => {
      const transaction = await makeContractCall({
        contractAddress: 'SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ',
        contractName: 'prediction-markets-vault',
        functionName: 'claim-reward',
        functionArgs: [Cl.uint(2)],
        postConditionMode: PostConditionMode.Allow,
        senderKey: Dexterity.config.privateKey,
        fee: 1000,
      });
      const result = await broadcastTransaction({ transaction });
      console.log(result);
    });
  });

  describe("Prediction Contract Generation", () => {

    it("should generate valid prediction contract", async () => {
      const contract = Vault.generatePredictionContractCode("prediction-test");
      console.log(contract);
    });

    it("should deploy prediction contract", { skip: true }, async () => {
      const result = await Vault.deployPredictionContract("prediction-markets-vault");
      console.log(result);
    });
  });

  // describe("Vault Metadata Management", () => {
  //   let testVault: Vault;

  //   beforeAll(async () => {
  //     testVault = await Vault.build("SP2D5BGGJ956A635JG7CJQ59FTRFRB0893514EZPJ.old-faithful");
  //   });

  //   it("should fetch initial metadata correctly", () => {
  //     expect(testVault.name).toBe("Old Faithful");
  //     expect(testVault.symbol).toBe("FAITH");
  //     expect(testVault.description).toBeTypeOf("string");
  //     expect(testVault.fee).toBeGreaterThan(0);
  //     expect(testVault.fee).toBeLessThanOrEqual(1000000);
  //     console.log(testVault);
  //   });

  //   it("should update metadata in memory", async () => {
  //     const updates = {
  //       description: "Updated description for testing",
  //     };

  //     await testVault.updateMetadata(updates);

  //     expect(testVault.description).toBe(updates.description);
  //   });

  //   it("should validate metadata updates", async () => {
  //     // Invalid name
  //     await expect(testVault.updateMetadata({
  //       name: "a"
  //     })).rejects.toThrow("Name must be at least 2 characters");

  //     // Invalid symbol
  //     await expect(testVault.updateMetadata({
  //       symbol: "ABC-D"
  //     })).rejects.toThrow("Symbol can only contain uppercase letters and numbers");
  //   });

  //   it('should persist metadata changes for the owner', async () => {

  //     const updatedMetadata = {
  //       description: 'Liquidity vault wrapper for the USDA-aeUSDC stableswap pair!'
  //     }

  //     await testVault.updateMetadataWithStorage(updatedMetadata);

  //     expect(testVault.description).toBe(updatedMetadata.description);
  //   });
  // }, 50000);
}, 50000);
