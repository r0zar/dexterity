// src/core/opcode.ts

import {
  bufferCV,
  BufferCV,
  OptionalCV,
  someCV,
  cvToHex,
} from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";
import { Token } from "../types";

export const OPERATION_TYPES = {
  SWAP_A_TO_B: 0x00,
  SWAP_B_TO_A: 0x01,
  ADD_LIQUIDITY: 0x02,
  REMOVE_LIQUIDITY: 0x03,
} as const;

export const SWAP_TYPES = {
  EXACT_INPUT: 0x00,
  EXACT_OUTPUT: 0x01,
} as const;

export const FEE_TYPES = {
  REDUCE_INPUT: 0x00,
  REDUCE_OUTPUT: 0x01,
  BURN_ENERGY: 0x02,
} as const;

export const LIQUIDITY_TYPES = {
  BALANCED: 0x00,
} as const;

export class Opcode {
  buffer: Uint8Array;

  constructor() {
    this.buffer = new Uint8Array(16).fill(0);
  }

  // Build Clarity value (buff 16)
  build(): OptionalCV<BufferCV> {
    return someCV(bufferCV(this.buffer));
  }

  // Optional quick hex output
  toHex(): string {
    return (
      "0x" +
      Array.from(this.buffer)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  // -- Setters --
  setBytes(bytes: number[]): this {
    bytes.forEach((byte, i) => {
      if (i < 16) this.buffer[i] = byte;
    });
    return this;
  }

  setOperation(operation: number): this {
    this.buffer[0] = operation;
    return this;
  }

  setSwapType(swapType: number): this {
    this.buffer[1] = swapType;
    return this;
  }

  setFeeType(feeType: number): this {
    this.buffer[2] = feeType;
    return this;
  }

  setLiquidityType(liquidityType: number): this {
    this.buffer[3] = liquidityType;
    return this;
  }

  // -- Getters --
  getOperation(): number {
    return this.buffer[0];
  }

  getSwapType(): number {
    return this.buffer[1];
  }

  getFeeType(): number {
    return this.buffer[2];
  }

  getLiquidityType(): number {
    return this.buffer[3];
  }

  // -- Debugging --
  debug() {
    return {
      hex: this.toHex(),
      operation: this.getOperation(),
      swapType: this.getSwapType(),
      feeType: this.getFeeType(),
      liquidityType: this.getLiquidityType(),
    };
  }

  // -- Static Helpers --
  static fromHex(hex: string): Opcode {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = hexToBytes(cleanHex);
    const op = new Opcode();
    op.buffer.set(bytes);
    return op;
  }

  // Common presets:
  static swapExactAForB(): Opcode {
    return new Opcode()
      .setOperation(OPERATION_TYPES.SWAP_A_TO_B)
      .setSwapType(SWAP_TYPES.EXACT_INPUT)
      .setFeeType(FEE_TYPES.REDUCE_INPUT);
  }

  static swapExactBForA(): Opcode {
    return new Opcode()
      .setOperation(OPERATION_TYPES.SWAP_B_TO_A)
      .setSwapType(SWAP_TYPES.EXACT_INPUT)
      .setFeeType(FEE_TYPES.REDUCE_INPUT);
  }

  static addBalancedLiquidity(): Opcode {
    return new Opcode()
      .setOperation(OPERATION_TYPES.ADD_LIQUIDITY)
      .setLiquidityType(LIQUIDITY_TYPES.BALANCED)
      .setFeeType(FEE_TYPES.REDUCE_INPUT);
  }

  static removeLiquidity(): Opcode {
    return new Opcode()
      .setOperation(OPERATION_TYPES.REMOVE_LIQUIDITY)
      .setLiquidityType(LIQUIDITY_TYPES.BALANCED);
  }

  /**
   * Example for building a router hop directly from tokens
   */
  static forRouterHop(
    tokenIn: Token,
    [tokenA, tokenB]: [Token, Token]
  ): string {
    const isAtoB = tokenIn.contractId === tokenA.contractId;
    // minimal example
    return cvToHex(
      someCV(
        bufferCV(
          new Uint8Array([
            isAtoB ? OPERATION_TYPES.SWAP_A_TO_B : OPERATION_TYPES.SWAP_B_TO_A,
            0x00, // e.g. default fee type, etc.
          ])
        )
      )
    );
  }
}
