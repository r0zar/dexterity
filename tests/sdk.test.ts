import "dotenv/config";
import { Dexterity } from "../src/core/sdk";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { LPToken } from "../src/types";

async function runTests() {
  console.log("Starting SDK Tests...\n");

  // Initialize SDK
  console.log("Test 1: SDK Initialization");
  console.log("-------------------------");

  await Dexterity.initialize();
  Dexterity.config.stxAddress = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";
  console.log("SDK Initialized!");
  // console.log(Dexterity);

  console.log("\n");

  let pools: LPToken[] = [];
  // put all the test data in the TEST_POOLS array
  for (const vault of Dexterity.router.vaults.values()) {
    pools.push(vault.getPool());
  }

  const fromToken = pools[0].liquidity[0];
  const toToken = pools[0].liquidity[1];

  // Test quote for direct swap
  console.log("Test 2: Direct Swap Quote (sBTC -> WELSH)");
  console.log("---------------------------------------");
  const quoteResult = await Dexterity.getQuote(fromToken, toToken, 1000000);
  console.log("Quote Result:", quoteResult);
  console.log("\n");

  // Test multi-hop quote
  console.log("Test 3: Multi-hop Quote (STX -> BTC)");
  console.log("------------------------------------");
  const multiHopQuoteResult = await Dexterity.getQuote(
    pools[0].liquidity[0],
    pools[1].liquidity[1],
    10000000
  );
  console.log("Multi-hop Quote Result:", multiHopQuoteResult);
  console.log("\n");

  // Test building direct swap transaction
  console.log("Test 4: Build Direct Swap Transaction");
  console.log("------------------------------------");
  const swapResult = await Dexterity.buildSwap(
    pools[0].liquidity[0],
    pools[0].liquidity[1],
    1000
  );
  console.log("Swap Transaction Result:", swapResult.unwrap());
  console.log("\n");

  // Test building multi-hop swap transaction
  console.log("Test 5: Build Multi-hop Swap Transaction");
  console.log("---------------------------------------");
  const multiHopSwapResult = await Dexterity.buildSwap(
    pools[0].liquidity[0],
    pools[1].liquidity[1],
    10000
  );

  console.log(
    "Multi-hop Swap Transaction Result:",
    multiHopSwapResult.unwrap()
  );
  console.log("\n");

  // Test vault queries
  console.log("Test 6: Vault Queries");
  console.log("---------------------");
  const stxVaults = Dexterity.getVaultsForToken(".stx");
  console.log("Vaults for STX:", stxVaults);

  const usdaVaults = Dexterity.getVaultsForToken(
    "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda"
  );
  console.log("Vaults for USDA:", usdaVaults);
  console.log("\n");

  // Test edge cases
  console.log("Test 7: Edge Cases");
  console.log("------------------");

  // Test very small amount
  const smallQuoteResult = await Dexterity.getQuote(
    pools[0].liquidity[0],
    pools[0].liquidity[1],
    100
  );
  console.log("Small Amount Quote Result:", smallQuoteResult);

  // Test very large amount
  const largeQuoteResult = await Dexterity.getQuote(
    pools[0].liquidity[0],
    pools[0].liquidity[1],
    1000
  );
  console.log("Large Amount Quote Result:", largeQuoteResult);

  // Test non-existent path
  const invalidTokenQuoteResult = await Dexterity.getQuote(
    {
      contractId: "SP000000000000000000002Q6VF78.token-xyz",
      identifier: "xyz",
      name: "XYZ Token",
      symbol: "XYZ",
      decimals: 6,
    },
    pools[0].liquidity[1],
    1000000
  );
  console.log("Invalid Token Quote Result:", invalidTokenQuoteResult);
  console.log("\n");

  console.log("All tests completed!");
}

// Run the tests
runTests().catch(console.error);
