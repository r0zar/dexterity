import { describe, it, expect } from "vitest";
import { Dexterity } from "../src/core/sdk";
import { Vault } from "../src/core/vault";
import { Opcode } from "../src/core/opcode";

describe("Vaults", async () => {
  it("should get a quote", async () => {
    const vault = new Vault({
      contractId:
        "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.anonymous-welsh-cvlt",
    } as any);
    Dexterity.config.mode = "client";
    const response = await vault.quote(100, new Opcode().setOperation(0));
    const quote = response.unwrap();
    expect(quote).toHaveProperty("amountIn");
  });
});
