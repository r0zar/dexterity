import {
  uintCV,
  cvToHex,
  PostCondition,
  Pc,
  PostConditionMode,
  TxBroadcastResult,
  makeContractCall,
  broadcastTransaction,
  makeContractDeploy,
} from "@stacks/transactions";
import { Opcode } from "./opcode";
import { Dexterity } from "./sdk";
import { ErrorUtils } from "../utils";
import { ERROR_CODES } from "../utils/constants";
import type { LPToken, Quote, Token, Delta, ExecuteOptions, ContractId, TokenMetadata, Liquidity } from "../types";
import { CodeGen } from "../utils/codegen";

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
  public engineContractId: string = "";
  // Pool state
  public liquidity: Liquidity[] = [];
  public tokenA: Liquidity;
  public tokenB: Liquidity;
  public supply: number = 0;

  constructor(config: Partial<LPToken> & { contractId: ContractId }) {
    this.contractId = config.contractId;
    [this.contractAddress, this.contractName] = this.contractId.split(".");

    // Initialize empty tokens
    this.tokenA = this.createLiquidity();
    this.tokenB = this.createLiquidity();

    // Populate available fields
    this.name = config.name ?? this.name;
    this.symbol = config.symbol ?? this.symbol;
    this.decimals = config.decimals ?? this.decimals;
    this.identifier = config.identifier ?? this.identifier;
    this.description = config.description ?? this.description;
    this.image = config.image ?? this.image;
    this.fee = config.fee ?? this.fee;
    this.supply = config.supply ?? this.supply;
    this.externalPoolId = config.externalPoolId ?? this.externalPoolId;
    this.liquidity = config.liquidity ?? this.liquidity;
    this.engineContractId = config.engineContractId ?? this.engineContractId;

    // Update liquidity tokens if available
    if (config.liquidity) {
      this.tokenA = { ...this.tokenA, ...config.liquidity[0] };
      this.tokenB = { ...this.tokenB, ...config.liquidity[1] };
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
  static async build(contractId: ContractId, reserves: boolean = true): Promise<Vault> {
    const vault = new Vault({ contractId });
    await vault.fetchMetadata();

    // Optional: skip reserves for faster loading
    if (reserves) {
      await vault.fetchPoolState();
    }

    return vault;
  }

  /**
   * Fetch and populate pool metadata
   */
  private async fetchMetadata(): Promise<TokenMetadata> {
    const metadata = await Dexterity.client.getTokenMetadata(this.contractId);
    if (!metadata.properties) {
      console.log(metadata);
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
    this.engineContractId = metadata.properties.engineContractId || "";

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
      engineContractId: this.engineContractId as ContractId
    };
  }


  async getBridgeRequests() {
    console.log('Getting bridge requests by:');
    console.log('1. Finding all BRIDGE_A_TO_B and BRIDGE_B_TO_A transactions for this vault');
    console.log('2. Looking up corresponding processed events on opposite chain');
    console.log('3. Identifying unprocessed requests that need handling');
    return []
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
      sponsored: Dexterity.config.sponsored,
    };
  }

  async executeTransaction(
    opcode: Opcode,
    amount: number,
    options: ExecuteOptions
  ): Promise<TxBroadcastResult | void> {
    try {
      const txConfig = await this.buildTransaction(opcode, amount);

      if (options?.disablePostConditions) {
        console.warn("Post conditions disabled!");
        txConfig.postConditionMode = PostConditionMode.Allow;
        txConfig.postConditions = []
      }

      if (txConfig instanceof Error) throw txConfig;
      if (Dexterity.config.mode === "server") {
        // Server-side: create and broadcast transaction
        if (!Dexterity.config.privateKey) {
          throw new Error("Private key is required for server-side contract calling");
        }
        const transaction = await makeContractCall({
          ...txConfig,
          senderKey: Dexterity.config.privateKey,
          fee: options.fee || 1000,
        });
        if (Dexterity.config.sponsored) {
          return Dexterity.client.requestSponsoredTransaction(transaction.serialize());
        } else {
          return broadcastTransaction({ transaction });
        }
      } else {
        // Client-side: use wallet to sign and broadcast
        const { showContractCall } = await import('@stacks/connect')
        await showContractCall({
          ...txConfig,
          fee: options.fee ?? 1000,
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
    amountOut: number,
  ): PostCondition[] {
    const maxAmountIn = Math.floor(amountIn * (1 + Dexterity.config.defaultSlippage)); // apply slippage
    const minAmountOut = Math.floor(amountOut * (1 - Dexterity.config.defaultSlippage)); // apply slippage
    // For wrapper contract, use external pool ID if available
    if (this.externalPoolId) {
      const postConditions = [
        this.createPostCondition(tokenIn, maxAmountIn, Dexterity.config.stxAddress, 'lte'),
        this.createPostCondition(tokenOut, minAmountOut, this.externalPoolId, 'gte'),
      ];

      // Add additional post condition for specific external pool
      if (this.externalPoolId === 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core' ||
        this.externalPoolId.startsWith('SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1')
      ) {
        postConditions.push(
          this.createPostCondition(tokenIn, 0, this.externalPoolId, 'gte')
        );
      }

      return postConditions;
    }

    // Default behavior for non-wrapper contracts
    return [
      this.createPostCondition(tokenIn, maxAmountIn, Dexterity.config.stxAddress, 'lte'),
      this.createPostCondition(tokenOut, minAmountOut, this.contractId, 'gte'),
    ];
  }

  // --------------------
  //  Contract Deployment
  // --------------------

  generateContractCode(): string {
    const deployConfig = CodeGen.generateVault(this.toLPToken());
    return deployConfig.codeBody;
  }

  async deployContract(): Promise<TxBroadcastResult | void> {
    const deployConfig = CodeGen.generateVault(this.toLPToken());

    if (Dexterity.config.mode === "server") {
      if (!Dexterity.config.privateKey) {
        throw new Error("Private key is required for server-side deployment");
      }
      const transaction = await makeContractDeploy({
        ...deployConfig,
        senderKey: Dexterity.config.privateKey,
      });
      return broadcastTransaction({ transaction });
    } else {
      const { showContractDeploy } = await import('@stacks/connect')
      await showContractDeploy(deployConfig);
    }
  }

  /**
   * Generate Prediction contract code for this vault
   */
  static generatePredictionContractCode(contractName: string): string {
    const deployConfig = CodeGen.generatePredictionsVault({
      contractName: contractName,
    });
    return deployConfig.codeBody;
  }

  static async deployPredictionContract(contractName: string): Promise<TxBroadcastResult | void> {
    const deployConfig = CodeGen.generatePredictionsVault({
      contractName: contractName,
    });

    if (Dexterity.config.mode === "server") {
      if (!Dexterity.config.privateKey) {
        throw new Error("Private key is required for server-side deployment");
      }
      const transaction = await makeContractDeploy({
        ...deployConfig,
        senderKey: Dexterity.config.privateKey,
      });
      return broadcastTransaction({ transaction });
    } else {
      const { showContractDeploy } = await import('@stacks/connect')
      await showContractDeploy(deployConfig);
    }
  }

  /**
   * Generate Hold-to-Earn engine contract code for this vault
   */
  generateHoldToEarnCode(): string {
    const holdToEarnConfig = {
      contractName: `${this.name}`,
      targetContract: this.contractId,
      contractId: `${this.contractAddress}.${this.contractName}-hold-to-earn`
    };

    const deployConfig = CodeGen.generateHoldToEarn(holdToEarnConfig);
    return deployConfig.codeBody;
  }

  /**
   * Deploy Hold-to-Earn engine contract for this vault
   */
  async deployHoldToEarnContract(): Promise<TxBroadcastResult | void> {
    const holdToEarnConfig = {
      contractName: `${this.name}`,
      targetContract: this.contractId,
      contractId: `${this.contractAddress}.${this.contractName}-hold-to-earn`
    };

    const deployConfig = CodeGen.generateHoldToEarn(holdToEarnConfig);

    if (Dexterity.config.mode === "server") {
      if (!Dexterity.config.privateKey) {
        throw new Error("Private key is required for server-side deployment");
      }
      const transaction = await makeContractDeploy({
        ...deployConfig,
        senderKey: Dexterity.config.privateKey,
      });
      return broadcastTransaction({ transaction });
    } else {
      const { openContractDeploy } = await import('@stacks/connect')
      await openContractDeploy(deployConfig);
    }
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
      case Opcode.types.ADD_LIQUIDITY:
        return [
          // Token A input
          this.createPostCondition(this.tokenA, quote.amountIn, Dexterity.config.stxAddress),
          // Token B input
          this.createPostCondition(this.tokenB, quote.amountOut, Dexterity.config.stxAddress),
        ];
      case Opcode.types.REMOVE_LIQUIDITY:
        return [
          // LP tokens input
          this.createPostCondition(
            { ...this, contractId: this.contractId },
            amount,
            Dexterity.config.stxAddress
          ),
          // Token A output
          this.createPostCondition(this.tokenA, quote.amountIn, this.contractId, 'gte'),
          // Token B output
          this.createPostCondition(this.tokenB, quote.amountOut, this.contractId, 'gte')
        ];
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private createPostCondition(
    token: Token,
    amount: number,
    sender: string,
    condition: 'eq' | 'gte' | 'lte' = 'eq'
  ): PostCondition {
    if (token.contractId === ".stx") {
      return condition === 'eq'
        ? Pc.principal(sender).willSendEq(amount).ustx()
        : condition === 'gte' ? Pc.principal(sender).willSendGte(amount).ustx()
          : Pc.principal(sender).willSendLte(amount).ustx();
    }
    return condition === 'eq'
      ? Pc.principal(sender).willSendEq(amount).ft(token.contractId, token.identifier)
      : condition === 'gte' ? Pc.principal(sender).willSendGte(amount).ft(token.contractId, token.identifier)
        : Pc.principal(sender).willSendLte(amount).ft(token.contractId, token.identifier);
  }

  /**
   * Update vault metadata fields
   */
  async updateMetadata(updates: Partial<TokenMetadata>): Promise<void> {
    // Validate required fields
    if (updates.name) this.validateName(updates.name);
    if (updates.symbol) this.validateSymbol(updates.symbol);
    if (updates.decimals) this.validateDecimals(updates.decimals);
    if (updates.properties?.lpRebatePercent) {
      this.validateFee(Math.floor((updates.properties.lpRebatePercent / 100) * 1000000));
    }

    // Update fields
    this.name = updates.name ?? this.name;
    this.symbol = updates.symbol ?? this.symbol;
    this.decimals = updates.decimals ?? this.decimals;
    this.identifier = updates.identifier ?? this.identifier;
    this.description = updates.description ?? this.description;
    this.image = updates.image ?? this.image;

    if (updates.properties) {
      this.fee = Math.floor((updates.properties.lpRebatePercent / 100) * 1000000);
      this.externalPoolId = updates.properties.externalPoolId || "";
      this.engineContractId = updates.properties.engineContractId || "";
    }
  }

  /**
   * Validate vault name (required for Clarity contract generation)
   */
  private validateName(name: string): void {
    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }
    if (!/^[a-zA-Z0-9\-]+$/.test(name)) {
      throw new Error("Name can only contain letters, numbers, and hyphens");
    }
  }

  /**
   * Validate vault symbol (required for Clarity contract generation)
   */
  private validateSymbol(symbol: string): void {
    if (symbol.length < 2 || symbol.length > 5) {
      throw new Error("Symbol must be between 2-5 characters");
    }
    if (!/^[A-Z0-9]+$/.test(symbol)) {
      throw new Error("Symbol can only contain uppercase letters and numbers");
    }
  }

  /**
   * Validate decimals (must be non-negative integer)
   */
  private validateDecimals(decimals: number): void {
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new Error("Decimals must be a non-negative integer");
    }
  }

  /**
   * Validate fee (must be between 0-1000000, representing 0-100%)
   */
  private validateFee(fee: number): void {
    if (!Number.isInteger(fee) || fee < 0 || fee > 1000000) {
      throw new Error("Fee must be between 0-1000000 (0-100%)");
    }
  }

  /**
   * Get full metadata object
   */
  getMetadata(): TokenMetadata {
    return {
      name: this.name,
      symbol: this.symbol,
      decimals: this.decimals,
      identifier: this.identifier,
      description: this.description,
      image: this.image,
      properties: {
        lpRebatePercent: (this.fee / 1000000) * 100,
        externalPoolId: this.externalPoolId,
        engineContractId: this.engineContractId,
        tokenAContract: this.tokenA.contractId,
        tokenBContract: this.tokenB.contractId
      }
    };
  }

  /**
   * Update metadata both in memory and persistence layer
   */
  async updateMetadataWithStorage(updates: Partial<TokenMetadata>): Promise<void> {
    // First validate and update in memory
    await this.updateMetadata(updates);

    // Then persist changes
    await this.persistMetadata();
  }

  /**
   * Persist current metadata state to storage
   */
  private async persistMetadata(): Promise<void> {
    const metadata = this.getMetadata();
    const uri = await this.getTokenUri();
    if (!uri) throw new Error("No token URI configured for vault");

    const { signMessage, showSignMessage } = await import('@stacks/connect');

    if (Dexterity.config.mode === "server") {
      await signMessage({
        message: this.contractId,
        network: Dexterity.config.network,
        appDetails: {
          name: 'Charisma Metadata Storage',
          icon: 'https://charisma.rocks/charisma.png',
        },
        onFinish: async (data) => {
          const response = await fetch(uri, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-signature': data.signature,
              'x-public-key': data.publicKey,
            },
            body: JSON.stringify(metadata)
          });
          if (!response.ok) {
            throw new Error(`Failed to persist metadata: ${response.statusText}`);
          }
        }
      });

    } else {
      showSignMessage({
        message: this.contractId,
        network: Dexterity.config.network,
        appDetails: {
          name: 'Charisma Metadata Storage',
          icon: 'https://charisma.rocks/charisma.png',
        },
        onFinish: async (data) => {
          const response = await fetch(uri, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-signature': data.signature,
              'x-public-key': data.publicKey,
            },
            body: JSON.stringify(metadata)
          });
          if (!response.ok) {
            throw new Error(`Failed to persist metadata: ${response.statusText}`);
          }
        }
      });
    }
  }

  /**
   * Get current token URI from contract
   */
  private async getTokenUri(): Promise<string | null> {
    try {
      const result = await Dexterity.client.callReadOnly(
        this.contractId,
        "get-token-uri"
      );
      return result.value;
    } catch (error) {
      console.error("Failed to get token URI:", error);
      return null;
    }
  }
}
