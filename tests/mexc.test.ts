import { describe, it} from "vitest";
import { Dexterity } from "../src/core/sdk";
import { MexcVault } from "../src/core/mexc-vault";
import { ContractId } from "../src/types";
import { Opcode } from "../src/core/opcode";

describe('mexc client', async () => {

    it('should get account info', async () => {
        const { client } = await import("../src/utils/mexc");
        const accountInfo = await client.accountInfo();
        console.log(accountInfo);
    });

    it('should check order book for welsh/usd', async () => {
        const { client } = await import("../src/utils/mexc");
        const orderBook = await client.depth('WELSHUSDT');
        console.log(orderBook);
    });

    it('should load the MEXC vault', async () => {
        const welshUsdtVault = new MexcVault({
            contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.welsh-usdt-pool" as ContractId,
            symbol: "WELSHUSDT",
            tokenA: {
              contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.welsh-token" as ContractId,
              name: "Welsh",
              symbol: "WELSH",
              decimals: 6,
              identifier: "welsh",
              reserves: 0
            },
            tokenB: {
              contractId: "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.usdt-token" as ContractId,
              name: "USDT",
              symbol: "USDT",
              decimals: 6,
              identifier: "usdt",
              reserves: 0
            }
          });
          
          // Add to router
          Dexterity.router.loadVaults([welshUsdtVault]);

          const reserves = await welshUsdtVault.fetchReserves();
          console.log(reserves);

          const quote = await welshUsdtVault.quote(1000000000, Opcode.swapExactAForB());
          console.log(quote);
    });

});