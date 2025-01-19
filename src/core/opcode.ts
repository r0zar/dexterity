// src/core/opcode.ts

import {
  bufferCV,
  BufferCV,
  OptionalCV,
  someCV,
  cvToHex,
} from "@stacks/transactions";
import { Token } from "../types";

export class Opcode {
  private code: number;
  static types = {
    SWAP_A_TO_B: 0x00,      // Swap token A for token B
    SWAP_B_TO_A: 0x01,      // Swap token B for token A
    ADD_LIQUIDITY: 0x02,    // Add liquidity to pool
    REMOVE_LIQUIDITY: 0x03, // Remove liquidity from pool
    LOOKUP_RESERVES: 0x04,  // Lookup reserves for a token
    BRIDGE_A_TO_B: 0x05,    // Bridge token A to token B
    BRIDGE_B_TO_A: 0x06,    // Bridge token B to token A
  }

  constructor(code: number = 0x00) {
    this.code = code;
  }

  // Build Clarity value (buff 16)
  build(): OptionalCV<BufferCV> {
    const buffer = new Uint8Array(16).fill(0);
    buffer[0] = this.code;
    return someCV(bufferCV(buffer));
  }

  // Get operation code
  getOperation(): number {
    return this.code;
  }

  // Set operation code
  setOperation(code: number): this {
    this.code = code;
    return this;
  }

  // Common operation presets
  static swapExactAForB(): Opcode {
    return new Opcode(this.types.SWAP_A_TO_B);
  }

  static swapExactBForA(): Opcode {
    return new Opcode(this.types.SWAP_B_TO_A);
  }

  static addLiquidity(): Opcode {
    return new Opcode(this.types.ADD_LIQUIDITY);
  }

  static removeLiquidity(): Opcode {
    return new Opcode(this.types.REMOVE_LIQUIDITY);
  }

  static lookupReserves(): Opcode {
    return new Opcode(this.types.LOOKUP_RESERVES);
  }

  static bridgeAtoB(): Opcode {
    return new Opcode(this.types.BRIDGE_A_TO_B);
  }

  static bridgeBtoA(): Opcode {
    return new Opcode(this.types.BRIDGE_B_TO_A);
  }

  /**
   * Helper for router operations
   */
  static forRouterHop(tokenIn: Token, [tokenA, tokenB]: [Token, Token]): string {
    const isAtoB = tokenIn.contractId === tokenA.contractId;
    return cvToHex((isAtoB ? Opcode.swapExactAForB() : Opcode.swapExactBForA()).build())
  }
}
