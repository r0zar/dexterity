import {
  contractPrincipalCV,
  PostConditionMode,
  uintCV,
  optionalCVOf,
  cvToValue,
  fetchCallReadOnlyFunction,
  Pc,
} from "@stacks/transactions";
import { Opcode, Presets } from "./opcode";
import type { Quote, LPToken, Token, TransactionConfig } from "../types";
import { STACKS_TESTNET } from "@stacks/network";

interface VaultOptions {
  network?: any;
  slippage?: number;
}

export class Vault {
  private pool: LPToken;
  private slippage: number;
  private network: any;

  constructor(pool: LPToken, options: VaultOptions = {}) {
    this.pool = pool;
    this.network = options.network || STACKS_TESTNET;
    this.slippage = options.slippage || 0;
  }

  /**
   * Core quote functionality that maps directly to contract
   */
  async quote(amount: number, opcode: Opcode): Promise<Quote> {
    // Call contract quote function
    const response = await fetchCallReadOnlyFunction({
      contractAddress: this.pool.contractId.split(".")[0],
      contractName: this.pool.contractId.split(".")[1],
      functionName: "quote",
      functionArgs: [uintCV(Math.floor(amount)), optionalCVOf(opcode.build())],
      senderAddress: this.pool.contractId,
      network: this.network,
    });

    const { dx, dy, dk } = cvToValue(response).value;
    return {
      dx: Number(dx.value),
      dy: Number(dy.value),
      dk: Number(dk.value),
    };
  }

  /**
   * Core execute functionality that maps directly to contract
   */
  async buildTransaction(
    sender: string,
    amount: number,
    opcode: Opcode,
    slippage: number = this.slippage
  ): Promise<TransactionConfig> {
    // Get quote for post conditions
    const quote = await this.quote(amount, opcode);

    // Build post conditions based on operation
    const postConditions = this.buildPostConditions(
      sender,
      opcode,
      amount,
      quote,
      slippage
    );

    return {
      network: this.network,
      contractAddress: this.pool.contractId.split(".")[0],
      contractName: this.pool.contractId.split(".")[1],
      functionName: "execute",
      functionArgs: [uintCV(amount), optionalCVOf(opcode.build())],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  /**
   * Helper method to build appropriate post conditions based on operation
   */
  private buildPostConditions(
    sender: string,
    opcode: Opcode,
    amount: number,
    quote: Quote,
    slippage: number
  ) {
    const threshold = 1 - slippage / 100;
    switch (opcode.toHex()) {
      case Presets.swapExactAForB().toHex():
        return [
          this.createPostCondition(
            this.pool.liquidity[0].token,
            amount,
            sender
          ),
          this.createPostCondition(
            this.pool.liquidity[1].token,
            Math.floor(quote.dy * threshold),
            this.pool.contractId
          ),
        ];

      case Presets.swapExactBForA().toHex():
        return [
          this.createPostCondition(
            this.pool.liquidity[1].token,
            amount,
            sender
          ),
          this.createPostCondition(
            this.pool.liquidity[0].token,
            Math.floor(quote.dy * threshold),
            this.pool.contractId
          ),
        ];

      case Presets.addBalancedLiquidity().toHex():
        return [
          this.createPostCondition(
            this.pool.liquidity[0].token,
            Math.ceil(quote.dx * (1 + slippage)),
            sender
          ),
          this.createPostCondition(
            this.pool.liquidity[1].token,
            Math.ceil(quote.dy * (1 + slippage)),
            sender
          ),
        ];

      case Presets.removeLiquidity().toHex():
        return [
          this.createPostCondition(this.pool, amount, sender),
          this.createPostCondition(
            this.pool.liquidity[0].token,
            Math.floor(quote.dx * slippage),
            this.pool.contractId
          ),
          this.createPostCondition(
            this.pool.liquidity[1].token,
            Math.floor(quote.dy * slippage),
            this.pool.contractId
          ),
        ];

      default:
        throw new Error(`Unknown opcode: ${opcode.debug()}`);
    }
  }

  /**
   * Create a post condition for token transfers
   */
  private createPostCondition(token: Token, amount: number, sender: string) {
    // Handle STX transfers
    if (token.contractId === ".stx") {
      return Pc.principal(sender).willSendEq(amount).ustx();
    }

    // For SIP10 tokens
    return Pc.principal(sender)
      .willSendEq(amount)
      .ft(token.contractId as any, token.identifier);
  }

  /**
   * Utility methods
   */

  getPool(): LPToken {
    return this.pool;
  }

  getNetwork(): any {
    return this.network;
  }

  setSlippage(slippage: number) {
    this.slippage = slippage;
  }
}
