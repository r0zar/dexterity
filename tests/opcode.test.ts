import { describe, it, expect } from "vitest";
import { Opcode, OperationType, SwapType, FeeType } from "../src/lib/opcode";

describe("Opcode", () => {
  it("should create basic swap opcode", () => {
    const builder = new Opcode()
      .setOperation(OperationType.SWAP_A_TO_B)
      .setSwapType(SwapType.EXACT_INPUT)
      .setFeeType(FeeType.REDUCE_INPUT);

    const result = builder.toHex();
    expect(result).toBe("00000000000000000000000000000000");
  });

  it("should correctly set operation type", () => {
    const builder = new Opcode().setOperation(OperationType.SWAP_A_TO_B);

    expect(builder.getByte(0)).toBe(OperationType.SWAP_A_TO_B);
  });

  it("should build from hex string", () => {
    const hex = "00010203000000000000000000000000";
    const builder = Opcode.fromHex(hex);

    expect(builder.toHex()).toBe(hex);
    expect(builder.getByte(0)).toBe(0x00);
    expect(builder.getByte(1)).toBe(0x01);
    expect(builder.getByte(2)).toBe(0x02);
    expect(builder.getByte(3)).toBe(0x03);
  });
});
