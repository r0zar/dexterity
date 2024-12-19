import { describe, it, expect, beforeAll } from "vitest";
import { STACKS_TESTNET } from "@stacks/network";
import { findDexterityContracts, getContractInfo } from "../src/lib/search";

describe("Search Functions", () => {
  const network = STACKS_TESTNET;
  const testAddress = "ST2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2SYCBMRR";

  describe("findDexterityContracts", () => {
    it("should fetch contracts implementing Dexterity trait", async () => {
      const { results } = await findDexterityContracts(network);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const limit = 2;
      const { results } = await findDexterityContracts(network, { limit });

      expect(results.length).toBeLessThanOrEqual(limit);
    });

    it("should respect offset parameter", async () => {
      const firstPage = await findDexterityContracts(network, {
        limit: 1,
        offset: 0,
      });
      const secondPage = await findDexterityContracts(network, {
        limit: 1,
        offset: 1,
      });

      // Check if we got different sets of contracts
      if (firstPage.results.length > 0 && secondPage.results.length > 0) {
        expect(firstPage.results[0].contract_id).not.toBe(
          secondPage.results[0].contract_id
        );
      }
    });
  });

  describe("getContractInfo", () => {
    it("should fetch contract details", async () => {
      // First get a list of contracts
      const { results } = await findDexterityContracts(network, { limit: 1 });

      if (results.length > 0) {
        const contractId = results[0].contract_id;
        const contractInfo = await getContractInfo(network, contractId);

        expect(contractInfo).toBeDefined();
        expect(contractInfo.contract_id).toBe(contractId);
        expect(contractInfo.abi).toBeDefined();
      } else {
        console.log("No contracts found to test getContractInfo");
      }
    });
  });
});
