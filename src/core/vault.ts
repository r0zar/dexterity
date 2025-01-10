import {
  uintCV,
  cvToHex,
  PostCondition,
  Pc,
  PostConditionMode,
  TxBroadcastResult,
  makeContractCall,
  broadcastTransaction,
} from "@stacks/transactions";
import { Opcode } from "./opcode";
import { Dexterity } from "./sdk";
import { ErrorUtils } from "../utils";
import { ERROR_CODES } from "../utils/constants";
import type { LPToken, Quote, Token, Delta, ExecuteOptions, ContractId, TokenMetadata, Liquidity } from "../types";
import { openContractCall } from "@stacks/connect";

export class Vault {
  public readonly contractAddress: string;
  public readonly contractName: string;
  public readonly contractId: ContractId;
  
  // Token metadata
  public name: string = "";
  public symbol: string = "";
  public decimals: number = 0;
  public identifier: string = "";
  public description: string = "";
  public image: string = "";
  public fee: number = 0;
  public externalPoolId: string = "";
  
  // Pool state
  public tokenA: Liquidity;
  public tokenB: Liquidity;
  public supply: number = 0;

  constructor(lpToken: Partial<LPToken> & { contractId: ContractId }) {
    this.contractId = lpToken.contractId;
    [this.contractAddress, this.contractName] = this.contractId.split(".");
    
    // Initialize empty tokens
    this.tokenA = this.createLiquidity();
    this.tokenB = this.createLiquidity();

    // Populate available fields
    this.name = lpToken.name ?? this.name;
    this.symbol = lpToken.symbol ?? this.symbol;
    this.decimals = lpToken.decimals ?? this.decimals;
    this.identifier = lpToken.identifier ?? this.identifier;
    this.description = lpToken.description ?? this.description;
    this.image = lpToken.image ?? this.image;
    this.fee = lpToken.fee ?? this.fee;
    this.supply = lpToken.supply ?? this.supply;
    this.externalPoolId = lpToken.externalPoolId ?? this.externalPoolId;

    // Update liquidity tokens if available
    if (lpToken.liquidity) {
      this.tokenA = { ...this.tokenA, ...lpToken.liquidity[0] };
      this.tokenB = { ...this.tokenB, ...lpToken.liquidity[1] };
    }
  }

  private createLiquidity(): Liquidity {
    return {
      contractId: "" as ContractId,
      identifier: "",
      name: "",
      symbol: "",
      decimals: 0,
      reserves: 0
    };
  }

  /**
   * Static factory method to build a Vault instance from a contract ID
   */
  static async build(contractId: ContractId, metadata: boolean = true): Promise<Vault | null> {
    try {
      const vault = new Vault({contractId});
    
      // Optional: skip metadata and pool state for faster loading
      if (metadata) {
        await vault.fetchMetadata();
        await vault.fetchPoolState();
      }

      return vault;
    } catch (error) {
      console.error(`Error building vault for ${contractId}:`, error);
      return null;
    }
  }

  /**
   * Fetch and populate pool metadata
   */
  private async fetchMetadata(): Promise<TokenMetadata> {
    const metadata = await Dexterity.client.getTokenMetadata(this.contractId);
    if (!metadata.properties) {
      throw new Error("Invalid pool metadata");
    }

    // Update vault metadata
    this.name = metadata.name;
    this.symbol = metadata.symbol;
    this.decimals = metadata.decimals;
    this.identifier = metadata.identifier;
    this.description = metadata.description || "";
    this.image = metadata.image || "";
    this.fee = Math.floor((metadata.properties.lpRebatePercent / 100) * 1000000);
    this.externalPoolId = metadata.properties.externalPoolId || "";

    // Fetch and set token info
    const [token0, token1] = await Promise.all([
      Dexterity.getTokenInfo(metadata.properties.tokenAContract),
      Dexterity.getTokenInfo(metadata.properties.tokenBContract),
    ]);

    // Update tokens
    this.tokenA = { ...token0, reserves: 0 };
    this.tokenB = { ...token1, reserves: 0 };

    return metadata;
  }
  
  /**
   * Fetch both reserves and supply using lookup opcode
   */
  private async fetchPoolState(): Promise<{ reserves: [number, number], supply: number }> {
    try {
      const lookupOpcode = Opcode.lookupReserves();
      const data = await this.callContract("quote", [0, lookupOpcode]);
      
      const reserves: [number, number] = [Number(data.dx), Number(data.dy)];
      const supply = Number(data.dk);

      // Update vault state
      this.tokenA.reserves = reserves[0];
      this.tokenB.reserves = reserves[1];
      this.supply = supply;

      return { reserves, supply };
    } catch (error) {
      // Fallback to individual balance checks
      const [reserve0, reserve1, supply] = await Promise.all([
        this.tokenA.contractId === ".stx"
          ? Dexterity.client.getStxBalance(this.contractId)
          : Dexterity.client.getTokenBalance(this.tokenA.contractId, this.contractId),
        this.tokenB.contractId === ".stx"
          ? Dexterity.client.getStxBalance(this.contractId)
          : Dexterity.client.getTokenBalance(this.tokenB.contractId, this.contractId),
        Dexterity.client.getTotalSupply(this.contractId)
      ]);

      // Update vault state
      this.tokenA.reserves = reserve0;
      this.tokenB.reserves = reserve1;
      this.supply = supply;

      return { reserves: [reserve0, reserve1], supply };
    }
  }

  /**
   * Get current reserves using lookup opcode
   */
  async fetchReserves(): Promise<[number, number]> {
    const { reserves } = await this.fetchPoolState();
    return reserves;
  }

  /**
   * Get current total supply
   */
  async fetchSupply(): Promise<number> {
    const { supply } = await this.fetchPoolState();
    return supply;
  }

  // -----------
  //  Current State Accessors
  // -----------
  getTokens(): [Token, Token] {
    return [this.tokenA, this.tokenB];
  }

  getReserves(): [number, number] {
    return [this.tokenA.reserves, this.tokenB.reserves];
  }

  getFee(): number {
    return this.fee;
  }

  // Convert to LPToken type for backward compatibility
  toLPToken(): LPToken {
    return {
      contractId: this.contractId,
      name: this.name,
      symbol: this.symbol,
      decimals: this.decimals,
      identifier: this.identifier,
      description: this.description,
      image: this.image,
      fee: this.fee,
      liquidity: [
        { ...this.tokenA },
        { ...this.tokenB }
      ],
      supply: this.supply,
      externalPoolId: this.externalPoolId as ContractId,
    };
  }

  // ----------------
  // Quoting & Reads
  // ----------------
  async quote(amount: number, opcode: Opcode): Promise<Quote | Error> {
    try {
      const contractQuote = await this.callContract("quote", [amount, opcode]);
      const { dx, dy, dk } = contractQuote as Delta;

      return {
        amountIn: dx,
        amountOut: dy,
        expectedPrice: dy / amount,
        minimumReceived: dy,
        fee: this.fee,
      };
    } catch (error) {
      return ErrorUtils.createError(
        ERROR_CODES.QUOTE_FAILED,
        "Failed to get quote",
        error
      );
    }
  }

  // -----------
  //  Execution
  // -----------
  async buildTransaction(opcode: Opcode, amount: number) {
    // Get quote first
    const quote = await this.quote(amount, opcode);
    if (quote instanceof Error) throw quote;

    // Build post conditions
    const postConditions = this.buildPostConditions(opcode, amount, quote);

    // Return config - functionArgs already handled by callContract
    return {
      network: Dexterity.config.network,
      contractAddress: this.contractAddress,
      contractName: this.contractName,
      functionName: "execute",
      functionArgs: [uintCV(amount), opcode.build()],
      postConditionMode: PostConditionMode.Deny,
      postConditions,
    };
  }

  async executeTransaction(
    opcode: Opcode,
    amount: number,
    options: ExecuteOptions
  ): Promise<TxBroadcastResult | void> {
    try {
      // First build the transaction config
      const txConfig = await this.buildTransaction(opcode, amount);
      if (txConfig instanceof Error) throw txConfig;

      if (Dexterity.config.mode === "server") {
        // Server-side: create and broadcast transaction
        const transaction = await makeContractCall({
          ...txConfig,
          senderKey: Dexterity.config.privateKey,
          fee: options.fee || 1000,
        });
        return broadcastTransaction({ transaction });
      } else {
        // Client-side: use wallet to sign and broadcast
        await openContractCall({
          ...txConfig,
          fee: options.fee || 1000,
        });
      }
    } catch (error) {
      throw ErrorUtils.createError(
        ERROR_CODES.TRANSACTION_FAILED,
        "Failed to execute transaction",
        error
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
    // For wrapper contract, use external pool ID if available
    if (this.externalPoolId) {
      const minAmountOut = Math.floor(amountOut * 0.99); // 1% error margin
      return [
        this.createPostCondition(tokenIn, amountIn, Dexterity.config.stxAddress, 'eq'),
        this.createPostCondition(tokenOut, minAmountOut, this.externalPoolId, 'gte'),
      ];
    }
    
    // Default behavior for non-wrapper contracts
    return [
      this.createPostCondition(tokenIn, amountIn, Dexterity.config.stxAddress),
      this.createPostCondition(tokenOut, amountOut, this.contractId),
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
      const contractId = `${this.contractAddress}.${this.contractName}`;
      result = await Dexterity.client.proxyReadOnly(contractId, method, [
        cvToHex(uintCV(amount)),
        cvToHex(opcode.build()),
      ]);
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
      case Opcode.types.SWAP_A_TO_B:
        return this.buildSwapPostConditions(
          this.tokenA,
          this.tokenB,
          amount,
          quote.amountOut
        );
      case Opcode.types.SWAP_B_TO_A:
        return this.buildSwapPostConditions(
          this.tokenB,
          this.tokenA,
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
    sender: string,
    condition: 'eq' | 'gte' = 'eq'
  ): PostCondition {
    if (token.contractId === ".stx") {
      return condition === 'eq' 
        ? Pc.principal(sender).willSendEq(amount).ustx()
        : Pc.principal(sender).willSendGte(amount).ustx();
    }
    return condition === 'eq'
      ? Pc.principal(sender).willSendEq(amount).ft(token.contractId, token.identifier)
      : Pc.principal(sender).willSendGte(amount).ft(token.contractId, token.identifier);
  }
}
