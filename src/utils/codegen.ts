import { Pc, PostCondition, PostConditionMode } from "@stacks/transactions";
import type { LPToken, Token } from "../types";
import { Dexterity } from "../core/sdk";

interface ContractGenerationOptions {
  isTokenAStx: boolean;
  isTokenBStx: boolean;
  tokenAContract: string;
  tokenBContract: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  lpRebateRaw: number;
  initialLiquidityA: number;
  initialLiquidityB: number;
  contractId: string;
  tokenUri: string;
}

export class CodeGen {
  /**
   * Helper function to generate transfer code based on token type
   */
  private static generateTransferIn(
    isStx: boolean,
    tokenContract: string,
    amount: string,
    sender: string,
    recipient: string
  ): string {
    return isStx
      ? `(try! (stx-transfer? ${amount} ${sender} ${recipient}))`
      : `(try! (contract-call? '${tokenContract} transfer ${amount} ${sender} ${recipient} none))`;
  }

  private static generateTransferOut(
    isStx: boolean,
    tokenContract: string,
    amount: string,
    sender: string,
    recipient: string
  ): string {
    return isStx
      ? `(try! (as-contract (stx-transfer? ${amount} ${sender} ${recipient})))`
      : `(try! (as-contract (contract-call? '${tokenContract} transfer ${amount} ${sender} ${recipient} none)))`;
  }

  private static getBalance(
    isStx: boolean,
    tokenContract: string,
    owner: string
  ): string {
    return isStx
      ? `(stx-get-balance ${owner})`
      : `(unwrap-panic (contract-call? '${tokenContract} get-balance ${owner}))`;
  }

  private static validateContract(config: LPToken) {
    // validate token names
    if (config.liquidity[0].name.length > 32 || config.liquidity[1].name.length > 32) {
      throw new Error("Token names must be less than 32 characters");
    }
    // validate token symbols
    if (config.liquidity[0].symbol.length > 8 || config.liquidity[1].symbol.length > 8) {
      throw new Error("Token symbols must be less than 8 characters");
    }
    // validate lprebate
    if (config.fee > 100000) {
      throw new Error("LP rebate must be less than 100000");
    }
    // symbol validation
    if (!/^[a-zA-Z0-9-]+$/.test(config.symbol)) {
      throw new Error("Symbol must only contain letters, numbers, and dashes");
    }
    // name validation (must be longer than 3 characters)
    if (config.name.length <= 3) {
      throw new Error("Name must be at least 3 characters");
    }
    // symbol and name must be different
    if (config.symbol === config.name) {
      throw new Error("Symbol and name must be different");
    }
  }

  /**
   * Generates the Clarity contract code for a liquidity pool
   */
  static generateVault(config: LPToken): any {
    this.validateContract(config);
    const options = this.prepareGenerationOptions(config);
    const mainContract = this.generateMainContract(options);
    const initBlock = this.generateInitializationBlock(options);
    const contract = mainContract + initBlock + `)`;

    const [, name] = config.contractId.split(".");
    const isTokenAStx = config.liquidity[0].contractId === ".stx";
    const isTokenBStx = config.liquidity[1].contractId === ".stx";
    
    return {
      contractName: name,
      codeBody: contract,
      postConditions: [
        isTokenAStx 
          ? Pc.principal(Dexterity.config.stxAddress).willSendEq(config.liquidity[0].reserves).ustx()
          : Pc.principal(Dexterity.config.stxAddress)
              .willSendEq(config.liquidity[0].reserves)
              .ft(config.liquidity[0].contractId, config.liquidity[0].identifier),
        isTokenBStx
          ? Pc.principal(Dexterity.config.stxAddress).willSendEq(config.liquidity[1].reserves).ustx()
          : Pc.principal(Dexterity.config.stxAddress)
              .willSendEq(config.liquidity[1].reserves)
              .ft(config.liquidity[1].contractId, config.liquidity[1].identifier)
      ],
      network: Dexterity.config.network,
      postConditionMode: PostConditionMode.Deny,
      fee: 300000,
      clarityVersion: 3
    }
  }

  private static prepareGenerationOptions(config: LPToken): ContractGenerationOptions {
    return {
      isTokenAStx: config.liquidity[0].contractId === ".stx",
      isTokenBStx: config.liquidity[1].contractId === ".stx",
      tokenAContract: config.liquidity[0].contractId,
      tokenBContract: config.liquidity[1].contractId,
      lpTokenName: config.name,
      lpTokenSymbol: config.symbol,
      lpRebateRaw: config.fee,
      initialLiquidityA: config.liquidity[0].reserves,
      initialLiquidityB: config.liquidity[1].reserves,
      contractId: config.contractId,
      tokenUri: `https://charisma.rocks/api/v0/metadata/${config.contractId}`
    };
  }

  private static generateMainContract(options: ContractGenerationOptions): string {
    const {
      isTokenAStx,
      isTokenBStx,
      tokenAContract,
      tokenBContract,
      lpTokenName,
      lpTokenSymbol,
      lpRebateRaw,
      tokenUri
    } = options;

    return `;; Title: ${lpTokenName}
;; Version: 1.0.0
;; Description: 
;;   Implementation of the standard trait interface for liquidity pools on the Stacks blockchain.
;;   Provides automated market making functionality between two SIP-010 compliant tokens.
;;   Implements SIP-010 fungible token standard for LP token compatibility.

;; Traits
(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-traits-v1.sip010-ft-trait)
(impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.dexterity-traits-v0.liquidity-pool-trait)

;; Constants
(define-constant DEPLOYER tx-sender)
(define-constant CONTRACT (as-contract tx-sender))
(define-constant ERR_UNAUTHORIZED (err u403))
(define-constant ERR_INVALID_OPERATION (err u400))
(define-constant PRECISION u1000000)
(define-constant LP_REBATE u${lpRebateRaw})

;; Opcodes
(define-constant OP_SWAP_A_TO_B 0x00)      ;; Swap token A for B
(define-constant OP_SWAP_B_TO_A 0x01)      ;; Swap token B for A
(define-constant OP_ADD_LIQUIDITY 0x02)    ;; Add liquidity
(define-constant OP_REMOVE_LIQUIDITY 0x03) ;; Remove liquidity
(define-constant OP_LOOKUP_RESERVES 0x04)  ;; Read pool reserves

;; Define LP token
(define-fungible-token ${lpTokenSymbol})
(define-data-var token-uri (optional (string-utf8 256)) (some u"${tokenUri}"))

;; --- SIP10 Functions ---

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
    (begin
        (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
        (try! (ft-transfer? ${lpTokenSymbol} amount sender recipient))
        (match memo to-print (print to-print) 0x0000)
        (ok true)))

(define-read-only (get-name)
    (ok "${lpTokenName}"))

(define-read-only (get-symbol)
    (ok "${lpTokenSymbol}"))

(define-read-only (get-decimals)
    (ok u6))

(define-read-only (get-balance (who principal))
    (ok (ft-get-balance ${lpTokenSymbol} who)))

(define-read-only (get-total-supply)
    (ok (ft-get-supply ${lpTokenSymbol})))

(define-read-only (get-token-uri)
    (ok (var-get token-uri)))

(define-public (set-token-uri (uri (string-utf8 256)))
    (if (is-eq contract-caller DEPLOYER)
        (ok (var-set token-uri (some uri))) 
        ERR_UNAUTHORIZED))

;; --- Core Functions ---

(define-public (execute (amount uint) (opcode (optional (buff 16))))
    (let (
        (sender tx-sender)
        (operation (get-byte opcode u0)))
        (if (is-eq operation OP_SWAP_A_TO_B) (swap-a-to-b amount)
        (if (is-eq operation OP_SWAP_B_TO_A) (swap-b-to-a amount)
        (if (is-eq operation OP_ADD_LIQUIDITY) (add-liquidity amount)
        (if (is-eq operation OP_REMOVE_LIQUIDITY) (remove-liquidity amount)
        ERR_INVALID_OPERATION))))))

(define-read-only (quote (amount uint) (opcode (optional (buff 16))))
    (let (
        (operation (get-byte opcode u0)))
        (if (is-eq operation OP_SWAP_A_TO_B) (ok (get-swap-quote amount opcode))
        (if (is-eq operation OP_SWAP_B_TO_A) (ok (get-swap-quote amount opcode))
        (if (is-eq operation OP_ADD_LIQUIDITY) (ok (get-liquidity-quote amount))
        (if (is-eq operation OP_REMOVE_LIQUIDITY) (ok (get-liquidity-quote amount))
        (if (is-eq operation OP_LOOKUP_RESERVES) (ok (get-reserves-quote))
        ERR_INVALID_OPERATION)))))))

;; --- Execute Functions ---

(define-public (swap-a-to-b (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-swap-quote amount (some OP_SWAP_A_TO_B))))
        ;; Transfer token A to pool
        ${this.generateTransferIn(isTokenAStx, tokenAContract, 'amount', 'sender', 'CONTRACT')}
        ;; Transfer token B to sender
        ${this.generateTransferOut(isTokenBStx, tokenBContract, '(get dy delta)', 'CONTRACT', 'sender')}
        (ok delta)))

(define-public (swap-b-to-a (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-swap-quote amount (some OP_SWAP_B_TO_A))))
        ;; Transfer token B to pool
        ${this.generateTransferIn(isTokenBStx, tokenBContract, 'amount', 'sender', 'CONTRACT')}
        ;; Transfer token A to sender
        ${this.generateTransferOut(isTokenAStx, tokenAContract, '(get dy delta)', 'CONTRACT', 'sender')}
        (ok delta)))

(define-public (add-liquidity (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-liquidity-quote amount)))
        ${this.generateTransferIn(isTokenAStx, tokenAContract, '(get dx delta)', 'sender', 'CONTRACT')}
        ${this.generateTransferIn(isTokenBStx, tokenBContract, '(get dy delta)', 'sender', 'CONTRACT')}
        (try! (ft-mint? ${lpTokenSymbol} (get dk delta) sender))
        (ok delta)))

(define-public (remove-liquidity (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-liquidity-quote amount)))
        (try! (ft-burn? ${lpTokenSymbol} (get dk delta) sender))
        ${this.generateTransferOut(isTokenAStx, tokenAContract, '(get dx delta)', 'CONTRACT', 'sender')}
        ${this.generateTransferOut(isTokenBStx, tokenBContract, '(get dy delta)', 'CONTRACT', 'sender')}
        (ok delta)))

;; --- Helper Functions ---

(define-private (get-byte (opcode (optional (buff 16))) (position uint))
    (default-to 0x00 (element-at? (default-to 0x00 opcode) position)))

(define-private (get-reserves)
    { 
      a: ${this.getBalance(isTokenAStx, tokenAContract, 'CONTRACT')}, 
      b: ${this.getBalance(isTokenBStx, tokenBContract, 'CONTRACT')}
    })

;; --- Quote Functions ---

(define-read-only (get-swap-quote (amount uint) (opcode (optional (buff 16))))
    (let (
        (reserves (get-reserves))
        (operation (get-byte opcode u0))
        (is-a-in (is-eq operation OP_SWAP_A_TO_B))
        (x (if is-a-in (get a reserves) (get b reserves)))
        (y (if is-a-in (get b reserves) (get a reserves)))
        (dx (/ (* amount (- PRECISION LP_REBATE)) PRECISION))
        (numerator (* dx y))
        (denominator (+ x dx))
        (dy (/ numerator denominator)))
        {
          dx: dx,
          dy: dy,
          dk: u0
        }))

(define-read-only (get-liquidity-quote (amount uint))
    (let (
        (k (ft-get-supply ${lpTokenSymbol}))
        (reserves (get-reserves)))
        {
          dx: (if (> k u0) (/ (* amount (get a reserves)) k) amount),
          dy: (if (> k u0) (/ (* amount (get b reserves)) k) amount),
          dk: amount
        }))

(define-read-only (get-reserves-quote)
    (let (
        (reserves (get-reserves))
        (supply (ft-get-supply ${lpTokenSymbol})))
        {
          dx: (get a reserves),
          dy: (get b reserves),
          dk: supply
        }))`;
  }

  private static generateInitializationBlock(options: ContractGenerationOptions): string {
    const baseAmount = Math.min(options.initialLiquidityA, options.initialLiquidityB);
    const additionalTokenA = Math.max(0, options.initialLiquidityA - baseAmount);
    const additionalTokenB = Math.max(0, options.initialLiquidityB - baseAmount);

    let initBlock = `

;; --- Initialization ---
(begin
    ;; Add initial balanced liquidity (handles both token transfers at 1:1)
    (try! (add-liquidity u${baseAmount}))`;

    if (additionalTokenA > 0) {
      initBlock += this.generateAdditionalTransfer(true, options, additionalTokenA);
    }

    if (additionalTokenB > 0) {
      initBlock += this.generateAdditionalTransfer(false, options, additionalTokenB);
    }

    return initBlock;
  }

  private static generateAdditionalTransfer(
    isTokenA: boolean,
    options: ContractGenerationOptions,
    amount: number
  ): string {
    const { isTokenAStx, isTokenBStx, tokenAContract, tokenBContract } = options;
    const isStx = isTokenA ? isTokenAStx : isTokenBStx;
    const contract = isTokenA ? tokenAContract : tokenBContract;

    return `
    
    ;; Transfer additional token ${isTokenA ? 'A' : 'B'} to achieve desired ratio
    ${this.generateTransferIn(
      isStx,
      contract,
      `u${amount}`,
      'tx-sender',
      'CONTRACT'
    )}`;
  }
} 