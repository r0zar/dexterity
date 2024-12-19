import { describe, it, expect } from "vitest";
import { ContractGenerator } from "../src/lib/generator";
import { LPToken } from "../src/types";

const testAddress = "ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR";

describe("ContractGenerator", () => {
  describe("generatePoolContract", () => {
    it("should generate a valid pool contract for STX and FT pairing", () => {
      const config: LPToken = {
        contractId: `${testAddress}.lp-token-rc4`,
        liquidity: [
          {
            token: {
              contractId: `.stx`,
              identifier: "stx",
              name: "Stacks Token",
              symbol: "STX",
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
            reserves: 10000000,
          },
        ],
        symbol: "DEX",
        name: "Dexterity",
        decimals: 6,
        identifier: "DEX",
        supply: 1000000,
        fee: 3000,
      };

      const contract = ContractGenerator.generateVaultContract(config);

      // Verify contract structure
      expect(contract).toContain(";; Title: Dexterity");
      expect(contract).toContain("(define-fungible-token DEX)");
      expect(contract).toContain(
        "(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait)"
      );

      // Verify the initial liquidity setup is correct
      expect(contract).toContain("u1000000");

      // Verify STX transfer handling
      expect(contract).toContain("(stx-transfer?");
      expect(contract).toContain("contract-call?");
    });

    it("should generate a valid pool contract for two fungible tokens", () => {
      const config: LPToken = {
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

      const contract = ContractGenerator.generateVaultContract(config);

      // Verify contract structure
      expect(contract).toContain(";; Title: Dexterity");
      expect(contract).toContain("(define-fungible-token DEX)");

      // Verify both token transfers use contract-call?
      expect(contract).toContain(
        "contract-call? 'ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR.charisma"
      );
      expect(contract).toContain(
        "contract-call? 'ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR.dme000-governance-token"
      );
    });
  });
});
