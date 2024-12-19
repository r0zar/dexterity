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
 * Swap Type Parameters (Byte 1)
 */
export enum SwapType {
  EXACT_INPUT = 0x00,
  EXACT_OUTPUT = 0x01,
}

/**
 * Fee Control Parameters (Byte 2)
 */
export enum FeeType {
  DEFAULT = 0x00,
  REDUCED = 0x01,
  DYNAMIC = 0x02,
  ORACLE = 0x03,
}

/**
 * Liquidity Addition Control (Byte 3)
 */
export enum LiquidityType {
  BALANCED = 0x00,
  SINGLE_SIDED_A = 0x01,
  SINGLE_SIDED_B = 0x02,
  ORACLE_WEIGHTED = 0x03,
  IMBALANCED = 0x04,
}

/**
 * Parameter Interfaces
 */
export interface OracleParams {
  source: number; // Byte 4: Oracle source identifier
  window: number; // Byte 5: Time window
  flags: number; // Byte 6: Configuration flags
  reserved: number; // Byte 7: Reserved for future use
}

export interface RoutingParams {
  maxHops: number; // Byte 8: Maximum number of hops
  strategy: number; // Byte 9: Routing strategy
  preferences: number; // Byte 10: Route preferences
  reserved: number; // Byte 11: Reserved for future use
}

export interface ConcentratedLiquidityParams {
  tickLower: number; // Byte 12: Lower tick
  tickUpper: number; // Byte 13: Upper tick
}

export interface LimitOrderParams {
  deadline: number; // Byte 14: Order deadline
  flags: number; // Byte 15: Order flags
}

/**
 * Opcode Builder
 */
export class OpcodeBuilder {
  private buffer: Uint8Array;

  constructor() {
    this.buffer = new Uint8Array(16);
  }

  /**
   * Core Operation Settings
   */
  setOperation(type: OperationType): OpcodeBuilder {
    this.buffer[0] = type;
    return this;
  }

  setSwapType(type: SwapType): OpcodeBuilder {
    this.buffer[1] = type;
    return this;
  }

  setFeeType(type: FeeType): OpcodeBuilder {
    this.buffer[2] = type;
    return this;
  }

  setLiquidityType(type: LiquidityType): OpcodeBuilder {
    this.buffer[3] = type;
    return this;
  }

  /**
   * Oracle Integration
   */
  setOracleParams(params: Partial<OracleParams>): OpcodeBuilder {
    this.buffer[4] = params.source || 0;
    this.buffer[5] = params.window || 0;
    this.buffer[6] = params.flags || 0;
    this.buffer[7] = params.reserved || 0;
    return this;
  }

  /**
   * Route Optimization
   */
  setRoutingParams(params: Partial<RoutingParams>): OpcodeBuilder {
    this.buffer[8] = params.maxHops || 0;
    this.buffer[9] = params.strategy || 0;
    this.buffer[10] = params.preferences || 0;
    this.buffer[11] = params.reserved || 0;
    return this;
  }

  /**
   * Concentrated Liquidity
   */
  setConcentratedLiquidity(
    params: Partial<ConcentratedLiquidityParams>
  ): OpcodeBuilder {
    this.buffer[12] = params.tickLower || 0;
    this.buffer[13] = params.tickUpper || 0;
    return this;
  }

  /**
   * Limit Orders
   */
  setLimitOrderParams(params: Partial<LimitOrderParams>): OpcodeBuilder {
    this.buffer[14] = params.deadline || 0;
    this.buffer[15] = params.flags || 0;
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
   * Creates an OpcodeBuilder from an existing hex string
   */
  static fromHex(hex: string): OpcodeBuilder {
    const builder = new OpcodeBuilder();
    const bytes = hexToBytes(hex);
    builder.buffer = new Uint8Array(bytes);
    return builder;
  }

  /**
   * Helper method to read specific parameter values
   */
  getParameter(bytePosition: number): number {
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
  swapExactAForB(): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.SWAP_A_TO_B)
      .setSwapType(SwapType.EXACT_INPUT)
      .setFeeType(FeeType.DEFAULT);
  },

  swapExactBForA(): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.SWAP_B_TO_A)
      .setSwapType(SwapType.EXACT_INPUT)
      .setFeeType(FeeType.DEFAULT);
  },

  /**
   * Liquidity Operation Presets
   */
  addBalancedLiquidity(): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.ADD_LIQUIDITY)
      .setLiquidityType(LiquidityType.BALANCED)
      .setFeeType(FeeType.DEFAULT);
  },

  removeLiquidity(): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.REMOVE_LIQUIDITY)
      .setLiquidityType(LiquidityType.BALANCED);
  },

  /**
   * Advanced Operation Presets
   */
  oracleSwap(params: Partial<OracleParams> = {}): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.SWAP_A_TO_B)
      .setFeeType(FeeType.ORACLE)
      .setOracleParams(params);
  },

  concentratedLiquidity(
    params: Partial<ConcentratedLiquidityParams>
  ): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.ADD_LIQUIDITY)
      .setLiquidityType(LiquidityType.BALANCED)
      .setConcentratedLiquidity(params);
  },

  limitOrder(params: Partial<LimitOrderParams>): OpcodeBuilder {
    return new OpcodeBuilder()
      .setOperation(OperationType.SWAP_A_TO_B)
      .setSwapType(SwapType.EXACT_INPUT)
      .setLimitOrderParams(params);
  },
};

/**
 * Usage Examples:
 *
 * Basic swap:
 * const swapOpcode = new OpcodeBuilder()
 *   .setOperation(OperationType.SWAP_A_TO_B)
 *   .setSwapType(SwapType.EXACT_INPUT)
 *   .build();
 *
 * Oracle swap:
 * const oracleOpcode = Presets.oracleSwap({
 *   source: 1,
 *   window: 3600,
 *   flags: 0x01
 * }).build();
 *
 * Concentrated liquidity:
 * const clOpcode = Presets.concentratedLiquidity({
 *   tickLower: -100,
 *   tickUpper: 100
 * }).build();
 */
