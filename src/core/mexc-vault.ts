import { Vault } from './vault';
import { Quote, ContractId, Liquidity } from '../types';
import { Opcode } from './opcode';
import client from '../utils/mexc';
import { ErrorUtils } from '../utils';
import { ERROR_CODES } from '../utils/constants';

export class MexcVault extends Vault {
  private lastOrderBook: any = null;
  private lastUpdateTime: number = 0;
  private readonly CACHE_DURATION = 5000; // 5 seconds

  constructor(config: {
    contractId: ContractId,
    symbol: string,
    tokenA: Liquidity,
    tokenB: Liquidity
  }) {
    super({ 
      contractId: config.contractId,
      name: `MEXC ${config.symbol}`,
      symbol: config.symbol,
      decimals: 6,
      fee: 5000, // 0.5% fee
      liquidity: [config.tokenA, config.tokenB],
      image: "https://altcoinsbox.com/wp-content/uploads/2023/01/mexc-logo.png"
    });
    
    this.symbol = config.symbol;
  }

  private async getOrderBook() {
    const now = Date.now();
    if (!this.lastOrderBook || now - this.lastUpdateTime > this.CACHE_DURATION) {
      this.lastOrderBook = await client.depth(this.symbol, {limit: 5000});
      this.lastUpdateTime = now;
    }
    return this.lastOrderBook;
  }

  async fetchReserves(): Promise<[number, number]> {
    const orderBook = await this.getOrderBook();

    // Calculate total liquidity from order book
    const bidLiquidity = orderBook.bids.reduce((sum: number, [price, amount]: number[]) => 
      sum + Number(amount) * Number(price), 0);
    const askLiquidity = orderBook.asks.reduce((sum: number, [price, amount]: number[]) => 
      sum + Number(amount), 0);
    
    // [USDT, WELSH]
    return [parseInt((bidLiquidity * 10 ** 8).toFixed(0)), parseInt((askLiquidity * 10 ** 6).toFixed(0))];
  }

  async quote(amount: number, opcode: Opcode): Promise<Quote | Error> {
    try {
      const orderBook = await this.getOrderBook();
      const operation = opcode.getOperation();

      let amountOut = 0;
      let remainingAmount = amount / 10 ** 8;

      if (operation === Opcode.types.SWAP_A_TO_B) {
        // Buying WELSH with USDT
        for (const [price, available] of orderBook.asks) {
          const fillAmount = Math.min(remainingAmount / price, available);
          amountOut += fillAmount;
          remainingAmount -= fillAmount * price;

          if (remainingAmount <= 0) break;
        }
      } else if (operation === Opcode.types.SWAP_B_TO_A) {
        // Selling WELSH for USDT
        for (const [price, available] of orderBook.bids) {
          const fillAmount = Math.min(remainingAmount, available);
          amountOut += fillAmount * price;
          remainingAmount -= fillAmount;
          
          if (remainingAmount <= 0) break;
        }
      }

      return {
        amountIn: amount,
        amountOut: Math.floor(amountOut * 10 ** 6),
        expectedPrice: amountOut / amount,
        minimumReceived: Math.floor(Math.floor(amountOut * 10 ** 6) * 0.99), // 1% slippage protection
        fee: this.fee
      };
    } catch (error) {
      return ErrorUtils.createError(
        ERROR_CODES.QUOTE_FAILED,
        "Failed to get quote from MEXC",
        error
      );
    }
  }
} 