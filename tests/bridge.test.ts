import { Dexterity } from "../src/core/sdk";
import { describe, it, expect, beforeAll } from "vitest";
// import { Connection, PublicKey } from "@solana/web3.js";

describe("Bridge Operations", () => {
  // let connection: Connection;

  // beforeAll(async () => {
  //   await Dexterity.configure()
  //   connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${Dexterity.config.heliusApiKey}`, "confirmed");
  // });

  // it("should fetch confirmed transactions for a contract", async () => {
  //   // trump memecoin token
  //   const address = new PublicKey("6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN");


  //   // Get signatures for contract's confirmed transactions
  //   const signatures = await connection.getSignaturesForAddress(
  //     address,
  //     { limit: 10 }  // Start with just 10 latest transactions
  //   );

  //   // Get full transaction details
  //   const transactions = await Promise.all(
  //     signatures.map(sig => 
  //       connection.getTransaction(sig.signature, {
  //         maxSupportedTransactionVersion: 0
  //       })
  //     )
  //   );

  //   console.log("Transaction count:", transactions.length);
  //   transactions.forEach(tx => {
  //     if (tx) {
  //       console.log("Signature:", tx.transaction.signatures[0], "BlockTime:", tx.blockTime);
  //       // Log other relevant transaction data
  //     }
  //   });

  //   expect(transactions.length).toBeGreaterThan(0);
  // });
});