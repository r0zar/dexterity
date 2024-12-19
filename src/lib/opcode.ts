import { bufferCV } from "@stacks/transactions";
import { hexToBytes } from "@stacks/common";

/**
 * Core Operation Types (Byte 0)
 */
export enum OperationType {
  SWAP_A_TO_B = 0x00,
  SWAP_B_TO_A = 0x01,
  ADD_LIQUIDITY = 0x02,
  REMOVE_LIQUIDITY = 0x03,
}

/**
 * Swap Operation Parameters (Byte 1)
 */
export enum SwapType {
  EXACT_INPUT = 0x00,
  EXACT_OUTPUT = 0x01,
}

/**
 * Liquidity Operation Parameters (Byte 2)
 */
export enum LiquidityType {
  BALANCED = 0x00,
}

/**
 * Fee Control Parameters (Byte 3)
 */
export enum FeeType {
  REDUCE_INPUT = 0x00,
  REDUCE_OUTPUT = 0x01,
  BURN_ENERGY = 0x02,
}

/**
 * Opcode Builder
 */
export class Opcode {
  private buffer: Uint8Array;

  constructor() {
    this.buffer = new Uint8Array(16);
  }

  /**
   * Core Operation Settings
   */
  setOperation(type: OperationType): Opcode {
    this.buffer[0] = type;
    return this;
  }

  setSwapType(type: SwapType): Opcode {
    this.buffer[1] = type;
    return this;
  }

  setFeeType(type: FeeType): Opcode {
    this.buffer[2] = type;
    return this;
  }

  setLiquidityType(type: LiquidityType): Opcode {
    this.buffer[3] = type;
    return this;
  }

  /**
   * Gets the hex string representation of the buffer
   */
  toHex(): string {
    return Array.from(this.buffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Builds the final opcode buffer as a Clarity value
   */
  build() {
    return bufferCV(hexToBytes(this.toHex()));
  }

  /**
   * Creates an Opcode from an existing hex string
   */
  static fromHex(hex: string): Opcode {
    const builder = new Opcode();
    const bytes = hexToBytes(hex);
    builder.buffer = new Uint8Array(bytes);
    return builder;
  }

  /**
   * Helper method to read specific parameter values
   */
  getByte(bytePosition: number): number {
    return this.buffer[bytePosition];
  }

  /**
   * Debug method to view current opcode state
   */
  debug(): string {
    return this.toHex();
  }
}

/**
 * Common Operation Presets
 */
export const Presets = {
  /**
   * Basic Operation Presets
   */
  swapExactAForB(): Opcode {
    return new Opcode()
      .setOperation(OperationType.SWAP_A_TO_B)
      .setSwapType(SwapType.EXACT_INPUT)
      .setFeeType(FeeType.REDUCE_INPUT);
  },

  swapExactBForA(): Opcode {
    return new Opcode()
      .setOperation(OperationType.SWAP_B_TO_A)
      .setSwapType(SwapType.EXACT_INPUT)
      .setFeeType(FeeType.REDUCE_INPUT);
  },

  /**
   * Liquidity Operation Presets
   */
  addBalancedLiquidity(): Opcode {
    return new Opcode()
      .setOperation(OperationType.ADD_LIQUIDITY)
      .setLiquidityType(LiquidityType.BALANCED)
      .setFeeType(FeeType.REDUCE_INPUT);
  },

  removeLiquidity(): Opcode {
    return new Opcode()
      .setOperation(OperationType.REMOVE_LIQUIDITY)
      .setLiquidityType(LiquidityType.BALANCED);
  },
};
