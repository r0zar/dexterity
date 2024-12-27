import { describe, it, expect } from "vitest";
import type { LPToken } from "../src/types";
import { Dexterity } from "../src/core/sdk";

describe("Contract Generator", () => {
  // Test pool configurations
  const STX_USDA_POOL: LPToken = {
    contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.stx-usda",
    name: "STX-USDA Pool",
    symbol: "STX-USDA-V1",
    identifier: "stx-usda-v1",
    decimals: 6,
    fee: 3000, // 0.3%
    liquidity: [
      {
        contractId: ".stx",
        identifier: "STX",
        name: "Stacks Token",
        symbol: "STX",
        decimals: 6,
        reserves: 1000000000000, // 1M STX
      },
      {
        contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda",
        identifier: "usda",
        name: "USDA Stablecoin",
        symbol: "USDA",
        decimals: 6,
        reserves: 1200000000000, // 1.2M USDA
      },
    ],
    supply: 0,
  };

  const BTC_USDA_POOL: LPToken = {
    contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.btc-usda",
    name: "BTC-USDA Pool",
    symbol: "BTC-USDA-V1",
    identifier: "btc-usda-v1",
    decimals: 8,
    fee: 3000,
    liquidity: [
      {
        contractId: "SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.wrapped-bitcoin",
        identifier: "wrapped-bitcoin",
        name: "Wrapped Bitcoin",
        symbol: "xBTC",
        decimals: 8,
        reserves: 5000000000, // 50 BTC
      },
      {
        contractId: "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda",
        identifier: "usda",
        name: "USDA Stablecoin",
        symbol: "USDA",
        decimals: 6,
        reserves: 1200000000000, // 1.2M USDA
      },
    ],
    supply: 0,
  };

  describe("Contract Generation", () => {
    it("should generate STX pool contract", () => {
      const contract = Dexterity.codegen.generateContractCode(STX_USDA_POOL);

      // Check core contract components
      expect(contract).includes(";; Title: STX-USDA Pool");
      expect(contract).includes("(define-fungible-token STX-USDA-V1)");
      expect(contract).includes("LP_REBATE u3000"); // 0.3% fee

      // Check token imports
      expect(contract).includes(".stx");
      expect(contract).includes(
        "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda"
      );

      // Check STX-specific transfer logic
      expect(contract).includes("stx-transfer?");
      expect(contract).includes("stx-get-balance");
    });

    it("should generate token-token pool contract", () => {
      const contract = Dexterity.codegen.generateContractCode(BTC_USDA_POOL);

      // Check core contract components
      expect(contract).includes(";; Title: BTC-USDA Pool");
      expect(contract).includes("(define-fungible-token BTC-USDA-V1)");

      // Verify no STX-specific code
      expect(contract).not.includes("stx-transfer?");
      expect(contract).not.includes("stx-get-balance");

      // Check proper contract calls for both tokens
      expect(contract).includes(
        "SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.wrapped-bitcoin"
      );
      expect(contract).includes(
        "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda"
      );
    });

    it("should handle initial liquidity ratios", () => {
      const contract = Dexterity.codegen.generateContractCode(STX_USDA_POOL);

      // Check base liquidity
      const baseAmount = Math.min(
        STX_USDA_POOL.liquidity[0].reserves,
        STX_USDA_POOL.liquidity[1].reserves
      );
      expect(contract).includes(`(try! (add-liquidity u${baseAmount}))`);

      // Check additional liquidity transfers
      if (STX_USDA_POOL.liquidity[0].reserves > baseAmount) {
        expect(contract).includes("Transfer additional token A");
      }
      if (STX_USDA_POOL.liquidity[1].reserves > baseAmount) {
        expect(contract).includes("Transfer additional token B");
      }
    });

    it("should generate valid token URIs", () => {
      const contract = Dexterity.codegen.generateContractCode(STX_USDA_POOL);
      const uri = `https://charisma.rocks/api/v0/metadata/${STX_USDA_POOL.contractId}`;
      expect(contract).includes(`(some u"${uri}")`);
    });

    it("should include all required trait implementations", () => {
      const contract = Dexterity.codegen.generateContractCode(STX_USDA_POOL);

      // Check SIP-010 trait
      expect(contract).includes(
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait"
      );

      // Check pool trait
      expect(contract).includes(
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dexterity-traits-v0.liquidity-pool-trait"
      );

      // Check required functions
      expect(contract).includes("(define-read-only (get-name)");
      expect(contract).includes("(define-read-only (get-symbol)");
      expect(contract).includes("(define-read-only (get-decimals)");
      expect(contract).includes("(define-read-only (get-balance");
      expect(contract).includes("(define-read-only (get-token-uri)");
    });

    it("should properly format operation codes", () => {
      const contract = Dexterity.codegen.generateContractCode(STX_USDA_POOL);

      // Check operation constants
      expect(contract).includes("OP_SWAP_A_TO_B 0x00");
      expect(contract).includes("OP_SWAP_B_TO_A 0x01");
      expect(contract).includes("OP_ADD_LIQUIDITY 0x02");
      expect(contract).includes("OP_REMOVE_LIQUIDITY 0x03");

      // Check operation handling
      expect(contract).includes("(get-byte opcode u0)");
      expect(contract).includes("ERR_INVALID_OPERATION");
    });
  });
});
