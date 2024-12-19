import { Token } from "./tokens";

export interface ContractMetadata {
  website?: string;
  logo?: string;
  socials?: {
    twitter?: string;
    discord?: string;
  };
}

export interface ContractConfig {
  /**
   * First token in the pair
   */
  tokenA: Token;

  /**
   * Second token in the pair
   */
  tokenB: Token;

  /**
   * Name for the LP token
   */
  lpTokenName: string;

  /**
   * Symbol for the LP token (e.g., "STXUSDA-LP")
   */
  lpTokenSymbol: string;

  /**
   * LP fee rebate percentage (e.g., 0.3 for 0.3%)
   */
  lpRebatePercent: number;

  /**
   * Initial tokenA liquidity amount (in smallest units)
   */
  initialLiquidityA: number;

  /**
   * Initial tokenB liquidity amount (in smallest units)
   */
  initialLiquidityB: number;

  /**
   * Optional description for the pool
   */
  description?: string;

  /**
   * Optional metadata for the pool
   */
  metadata?: ContractMetadata;
}
