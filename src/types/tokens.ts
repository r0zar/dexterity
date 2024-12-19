export interface TokenMetadata {
  /**
   * Token symbol (e.g., "STX", "USDA")
   */
  symbol: string;

  /**
   * Full token name
   */
  name: string;

  /**
   * Number of decimal places (typically 6 for Stacks tokens)
   */
  decimals: number;

  /**
   * SIP-010 token identifier (not required for STX)
   */
  identifier?: string;
}

export interface Token {
  /**
   * Contract identifier (e.g., "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-a")
   * For STX, use ".stx"
   */
  contractId: string;

  /**
   * Token metadata
   */
  metadata: TokenMetadata;
}
