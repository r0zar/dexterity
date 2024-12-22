// src/core/vault.ts

import {
  fetchCallReadOnlyFunction,
  uintCV,
  cvToHex,
  cvToValue,
  PostCondition,
  Pc,
  PostConditionMode,
} from "@stacks/transactions";
import { Opcode } from "./opcode";
import { Dexterity } from "./sdk";
import { ContractUtils, ErrorUtils, Result } from "../utils";
import { ERROR_CODES, OPERATION_TYPES } from "../constants";
import type { LPToken, Quote, Token, TransactionConfig, Delta } from "../types";

export class Vault {
  private readonly contractAddress: string;
  private readonly contractName: string;

  constructor(private readonly pool: LPToken) {
    [this.contractAddress, this.contractName] = ContractUtils.parseContractId(
      pool.contractId
    );
  }

  // ----------------
  // Quoting & Reads
  // ----------------
  async quote(amount: number, opcode: Opcode): Promise<Result<Quote, Error>> {
    try {
      const contractQuote = await this.callContract("quote", [amount, opcode]);
      const { dx, dy, dk } = contractQuote as Delta;

      return Result.ok({
        amountIn: dx,
        amountOut: dy,
        expectedPrice: dy / amount,
        minimumReceived: dy,
        fee: this.pool.fee,
      });
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.QUOTE_FAILED,
          "Failed to get quote",
          error
        )
      );
    }
  }

  // -----------
  //  Execution
  // -----------
  async buildTransaction(
    opcode: Opcode,
    amount: number
  ): Promise<Result<TransactionConfig | Quote, Error>> {
    try {
      // First, get a quote
      const quoteResult = await this.quote(amount, opcode);
      if (quoteResult.isErr()) return quoteResult;
      const quote = quoteResult.unwrap();

      // Build post-conditions for a single-hop swap
      const postConditions = this.buildPostConditions(opcode, amount, quote);

      // Build final transaction config
      const functionArgs =
        Dexterity.config.mode === "server"
          ? [cvToHex(uintCV(amount)), cvToHex(opcode.build())]
          : [uintCV(amount), opcode.build()];

      return Result.ok({
        network: Dexterity.config.network,
        contractAddress: this.contractAddress,
        contractName: this.contractName,
        functionName: "execute",
        functionArgs,
        postConditionMode: PostConditionMode.Deny,
        postConditions,
      });
    } catch (error) {
      return Result.err(
        ErrorUtils.createError(
          ERROR_CODES.TRANSACTION_FAILED,
          "Failed to build transaction",
          error
        )
      );
    }
  }

  /**
   * Router (multi-hop) uses this to just build post conditions
   * for each hop if needed, rather than a full transaction.
   */
  buildSwapPostConditions(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: number,
    amountOut: number
  ): PostCondition[] {
    // If you want slippage logic here, can do so. For now, a direct eq.
    return [
      this.createPostCondition(tokenIn, amountIn, Dexterity.config.stxAddress),
      this.createPostCondition(tokenOut, amountOut, this.pool.contractId),
    ];
  }

  // -----------
  //  Internals
  // -----------
  private async callContract(
    method: string,
    [amount, opcode]: [number, Opcode]
  ): Promise<Delta> {
    let result;

    if (Dexterity.config.mode === "server") {
      const contractId = `${this.contractAddress}.${this.contractName}`;
      result = await Dexterity.client.callReadOnly(contractId, method, [
        cvToHex(uintCV(amount)),
        cvToHex(opcode.build()),
      ]);
    } else {
      const response = await fetchCallReadOnlyFunction({
        contractAddress: this.contractAddress,
        contractName: this.contractName,
        functionName: method,
        functionArgs: [uintCV(amount), opcode.build()],
        senderAddress: this.pool.contractId,
        network: Dexterity.config.network,
      });
      result = cvToValue(response).value;
    }

    return {
      dx: Number(result.dx.value),
      dy: Number(result.dy.value),
      dk: Number(result.dk.value),
    };
  }

  private buildPostConditions(
    opcode: Opcode,
    amount: number,
    quote: Quote
  ): PostCondition[] {
    const operation = opcode.getOperation();
    switch (operation) {
      case OPERATION_TYPES.SWAP_A_TO_B:
        return this.buildSwapPostConditions(
          this.pool.liquidity[0],
          this.pool.liquidity[1],
          amount,
          quote.amountOut
        );
      case OPERATION_TYPES.SWAP_B_TO_A:
        return this.buildSwapPostConditions(
          this.pool.liquidity[1],
          this.pool.liquidity[0],
          amount,
          quote.amountOut
        );
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private createPostCondition(
    token: Token,
    amount: number,
    sender: string
  ): PostCondition {
    if (token.contractId === ".stx") {
      return Pc.principal(sender).willSendEq(amount).ustx();
    }
    return Pc.principal(sender)
      .willSendEq(amount)
      .ft(token.contractId, token.identifier);
  }

  // -----------
  //  Accessors
  // -----------
  getPool(): LPToken {
    return this.pool;
  }

  getTokens(): [Token, Token] {
    return [this.pool.liquidity[0], this.pool.liquidity[1]];
  }

  getReserves(): [number, number] {
    return [this.pool.liquidity[0].reserves, this.pool.liquidity[1].reserves];
  }

  getFee(): number {
    return this.pool.fee;
  }
}