import { describe, it, expect } from "vitest";
import { ContractGenerator } from "../src/lib/generator";
import { ContractConfig } from "../src/types/contracts";

describe("ContractGenerator", () => {
  describe("generatePoolContract", () => {
    it("should generate a valid pool contract for STX and FT pairing", () => {
      const config: ContractConfig = {
        tokenA: {
          contractId: ".stx",
          metadata: {
            symbol: "STX",
            name: "Stacks Token",
            decimals: 6,
          },
        },
        tokenB: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token",
          metadata: {
            symbol: "USDA",
            name: "USDA Token",
            decimals: 6,
            identifier: "usda",
          },
        },
        lpTokenName: "STX-USDA LP Token",
        lpTokenSymbol: "STXUSDA-LP",
        lpRebatePercent: 0.3,
        initialLiquidityA: 100000000, // 100 STX
        initialLiquidityB: 100000000, // 100 USDA
      };

      const contract = ContractGenerator.generatePoolContract(config);

      // Verify contract structure
      expect(contract).toContain(";; Title: STX-USDA LP Token");
      expect(contract).toContain("(define-fungible-token STXUSDA-LP)");
      expect(contract).toContain(
        "(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait)"
      );

      // Verify the initial liquidity setup is correct
      expect(contract).toContain("u100000000");

      // Verify STX transfer handling
      expect(contract).toContain("(stx-transfer?");
      expect(contract).toContain("contract-call?");
    });

    it("should generate a valid pool contract for two fungible tokens", () => {
      const config: ContractConfig = {
        tokenA: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-a",
          metadata: {
            symbol: "TOKA",
            name: "Token A",
            decimals: 6,
            identifier: "token-a",
          },
        },
        tokenB: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-b",
          metadata: {
            symbol: "TOKB",
            name: "Token B",
            decimals: 6,
            identifier: "token-b",
          },
        },
        lpTokenName: "TOKA-TOKB LP Token",
        lpTokenSymbol: "TOKATOKB-LP",
        lpRebatePercent: 0.3,
        initialLiquidityA: 1000000,
        initialLiquidityB: 1000000,
      };

      const contract = ContractGenerator.generatePoolContract(config);

      // Verify contract structure
      expect(contract).toContain(";; Title: TOKA-TOKB LP Token");
      expect(contract).toContain("(define-fungible-token TOKATOKB-LP)");

      // Verify both token transfers use contract-call?
      expect(contract).toContain(
        "contract-call? 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-a"
      );
      expect(contract).toContain(
        "contract-call? 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-b"
      );
    });

    it("should handle uneven initial liquidity correctly", () => {
      const config: ContractConfig = {
        tokenA: {
          contractId: ".stx",
          metadata: {
            symbol: "STX",
            name: "Stacks Token",
            decimals: 6,
          },
        },
        tokenB: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token",
          metadata: {
            symbol: "USDA",
            name: "USDA Token",
            decimals: 6,
            identifier: "usda",
          },
        },
        lpTokenName: "STX-USDA Uneven LP",
        lpTokenSymbol: "STXUSDA-ULP",
        lpRebatePercent: 0.3,
        initialLiquidityA: 200000000, // 200 STX
        initialLiquidityB: 100000000, // 100 USDA
      };

      const contract = ContractGenerator.generatePoolContract(config);

      // Verify that additional liquidity is handled correctly
      expect(contract).toContain("(try! (add-liquidity u100000000)");
      expect(contract).toContain(
        "(try! (stx-transfer? u100000000 tx-sender CONTRACT))"
      );
    });

    it("should validate metadata formatting", () => {
      const config: ContractConfig = {
        tokenA: {
          contractId: ".stx",
          metadata: {
            symbol: "STX",
            name: "Stacks Token",
            decimals: 6,
          },
        },
        tokenB: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token",
          metadata: {
            symbol: "USDA",
            name: "USDA Token",
            decimals: 6,
            identifier: "usda",
          },
        },
        lpTokenName: "STX-USDA LP Token",
        lpTokenSymbol: "STXUSDA-LP",
        lpRebatePercent: 0.3,
        initialLiquidityA: 100000000,
        initialLiquidityB: 100000000,
        description: "STX-USDA Liquidity Pool",
        metadata: {
          website: "https://example.com",
          logo: "https://example.com/logo.png",
          socials: {
            twitter: "@example",
            discord: "discord.gg/example",
          },
        },
      };

      const contract = ContractGenerator.generatePoolContract(config);

      // Verify metadata handling
      expect(contract).toContain("STX-USDA LP Token");
      expect(contract).toContain("charisma.rocks/api/v0/metadata");
    });

    it("should handle different fee configurations", () => {
      const config: ContractConfig = {
        tokenA: {
          contractId: ".stx",
          metadata: {
            symbol: "STX",
            name: "Stacks Token",
            decimals: 6,
          },
        },
        tokenB: {
          contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token",
          metadata: {
            symbol: "USDA",
            name: "USDA Token",
            decimals: 6,
            identifier: "usda",
          },
        },
        lpTokenName: "STX-USDA LP Token",
        lpTokenSymbol: "STXUSDA-LP",
        lpRebatePercent: 5, // Different fee configuration
        initialLiquidityA: 100000000,
        initialLiquidityB: 100000000,
      };

      const contract = ContractGenerator.generatePoolContract(config);

      // Verify fee calculation
      expect(contract).toContain("u50000"); // 5% converted
    });
  });
});
