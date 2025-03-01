import { Pc, PostConditionMode } from "@stacks/transactions";
import type { LPToken } from "../types";
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

interface PredictionContractGenerationOptions {
  contractName: string;
}

interface HoldToEarnOptions {
  contractName: string;
  targetContract: string;
  contractId: string;
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

  static generatePredictionsVault(options: PredictionContractGenerationOptions): any {
    return {
      contractName: options.contractName,
      codeBody: this.generatePredictionContract(),
      postConditions: [],
      postConditionMode: PostConditionMode.Deny,
      network: Dexterity.config.network,
      fee: 50000,
      clarityVersion: 3
    };
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
      fee: 50000,
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

  private static generatePredictionContract(): string {
    return `;; Title: Blaze Prediction Market Vault
;; Version: 1.0.0
;; Description: 
;;   Implementation of a prediction market vault for the Stacks blockchain.
;;   Allows users to create markets, make predictions, and claim rewards.
;;   Market resolution is controlled by the vault deployer or authorized admins.
;;   Each prediction is tracked as a non-fungible token receipt.

;; Traits
;; (impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.betting-traits-v0.betting-vault-trait)
;; (impl-trait 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.nft-trait.nft-trait)

;; Constants
(define-constant DEPLOYER tx-sender)
(define-constant CONTRACT (as-contract tx-sender))
(define-constant ERR_UNAUTHORIZED (err u403))
(define-constant ERR_INVALID_OPERATION (err u400))
(define-constant ERR_MARKET_EXISTS (err u401))
(define-constant ERR_MARKET_NOT_FOUND (err u404))
(define-constant ERR_MARKET_CLOSED (err u405))
(define-constant ERR_MARKET_NOT_RESOLVED (err u406))
(define-constant ERR_NOT_WINNER (err u408))
(define-constant ERR_INVALID_OUTCOME (err u409))
(define-constant ERR_INVALID_TOKEN_ID (err u410))
(define-constant ERR_NO_PREDICTION (err u411))
(define-constant ERR_PREDICTION_NOT_FOUND (err u412))
(define-constant PRECISION u1000000)
(define-constant ADMIN_FEE u50000)   ;; 5% fee to admin who resolves the market

;; Opcodes (0xA* range to avoid LP conflicts)
(define-constant OP_PREDICT 0xA1)    ;; Make a prediction
(define-constant OP_CLAIM_REWARD 0xA3)  ;; Claim rewards

;; Define NFT for prediction receipts
(define-non-fungible-token prediction-receipt uint)

;; Data structures
(define-map markets uint {
  creator: principal,
  name: (string-ascii 64),
  description: (string-ascii 128),
  outcome-names: (list 16 (string-ascii 32)),
  outcome-pools: (list 16 uint),
  total-pool: uint,
  is-open: bool,
  is-resolved: bool,
  winning-outcome: uint,
  resolver: (optional principal),  ;; Admin who resolved the market
  creation-time: uint,
  resolution-time: uint
})

;; Map to track receipts by receipt ID (no predictor field)
(define-map predictions uint {
  market-id: uint,
  outcome-id: uint,
  amount: uint
})

;; Map for authorized oracles/admins
(define-map authorized-admins principal bool)

;; Next token ID counter
(define-data-var next-receipt-id uint u1)

;; Token metadata URI
(define-data-var token-uri (string-utf8 256) u"https://charisma.rocks/sip9/predictions/receipt.json")

;; --- NFT Trait Functions ---

(define-public (transfer (receipt-id uint) (sender principal) (recipient principal))
    (begin
        (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
        (nft-transfer? prediction-receipt receipt-id sender recipient)
    ))

(define-read-only (get-last-token-id)
    (ok (- (var-get next-receipt-id) u1)))

(define-read-only (get-token-uri (token-id uint))
    (ok (some (var-get token-uri))))

(define-public (set-token-uri (new-uri (string-utf8 256)))
    (begin
        (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
        (ok (var-set token-uri new-uri))
    ))

(define-read-only (get-owner (token-id uint))
    (ok (nft-get-owner? prediction-receipt token-id)))

;; --- Core Functions ---

;; (define-public (execute (amount uint) (opcode (optional (buff 16))))
;;     (let (
;;         (op-buffer (default-to 0x00 opcode))
;;         (op-type (get-byte op-buffer u0))
;;         (market-id (get-byte op-buffer u1))
;;         (outcome-id (get-byte op-buffer u2))
;;         (receipt-id amount))
;;         (if (is-eq op-type (buff-to-uint-le OP_PREDICT)) (make-prediction market-id outcome-id amount)
;;         (if (is-eq op-type (buff-to-uint-le OP_CLAIM_REWARD)) (claim-reward receipt-id)
;;         ERR_INVALID_OPERATION))))

(define-read-only (quote (amount uint) (opcode (optional (buff 16))))
    (let (
        (op-buffer (default-to 0x00 opcode))
        (op-type (get-byte op-buffer u0))
        (market-id (get-byte op-buffer u1))
        (outcome-id (get-byte op-buffer u2))
        (receipt-id amount))
        (if (is-eq op-type (buff-to-uint-le OP_PREDICT)) (quote-prediction market-id outcome-id)
        (if (is-eq op-type (buff-to-uint-le OP_CLAIM_REWARD)) (quote-reward receipt-id)
        ERR_INVALID_OPERATION))))

;; --- Market Management Functions ---

;; Create a new prediction market (standard function, not an opcode)
(define-public (create-market 
    (market-id uint) 
    (name (string-ascii 64)) 
    (description (string-ascii 128))
    (outcome-names (list 16 (string-ascii 32))))
    (begin
        ;; Check if market ID already exists
        (asserts! (is-none (map-get? markets market-id)) ERR_MARKET_EXISTS)
        
        ;; Initialize empty outcome pools
        (let ((empty-pools (list 
            u0 u0 u0 u0 u0 u0 u0 u0
            u0 u0 u0 u0 u0 u0 u0 u0)))
            
            ;; Create a new prediction market
            (map-set markets market-id {
                creator: tx-sender,
                name: name,
                description: description,
                outcome-names: outcome-names,
                outcome-pools: empty-pools,
                total-pool: u0,
                is-open: true,
                is-resolved: false,
                winning-outcome: u0,
                resolver: none,
                creation-time: stacks-block-height,
                resolution-time: u0
            })
            
            (ok {
                market-id: market-id,
                creator: tx-sender,
                creation-time: stacks-block-height
            })
        )
    )
)

;; Close a market (no more predictions allowed)
(define-public (close-market (market-id uint))
    (let ((market (unwrap! (map-get? markets market-id) ERR_MARKET_NOT_FOUND)))
        ;; Only vault deployer or authorized admin can close
        (asserts! (or 
            (is-eq tx-sender DEPLOYER)
            (default-to false (map-get? authorized-admins tx-sender))) 
            ERR_UNAUTHORIZED)
        
        ;; Update market status
        (map-set markets market-id (merge market { is-open: false }))
        
        (ok true)
    )
)

;; Resolve a market (determine correct outcome)
(define-public (resolve-market (market-id uint) (winning-outcome uint))
    (let (
        (sender tx-sender)
        (market (unwrap! (map-get? markets market-id) ERR_MARKET_NOT_FOUND))
        (admin-fee (/ (* (get total-pool market) ADMIN_FEE) PRECISION))  ;; Calculate 5% fee
    )
        ;; Only vault deployer or authorized admin can resolve
        (asserts! (or 
            (is-eq sender DEPLOYER)
            (default-to false (map-get? authorized-admins sender))) 
            ERR_UNAUTHORIZED)
        
        ;; Check that outcome is valid
        (asserts! (< winning-outcome (len (get outcome-names market))) ERR_INVALID_OUTCOME)

        ;; Pay admin fee directly to resolver
        (try! (as-contract (stx-transfer? admin-fee CONTRACT sender)))
        
        ;; Update market state
        (map-set markets market-id (merge market {
            is-open: false,
            is-resolved: true,
            winning-outcome: winning-outcome,
            resolver: (some sender),
            resolution-time: stacks-block-height
        }))
        
        (ok true)
    )
)

;; --- Execute Functions ---

(define-public (make-prediction (market-id uint) (outcome-id uint) (amount uint))
    (let (
        (sender tx-sender)
        (market (unwrap! (map-get? markets market-id) ERR_MARKET_NOT_FOUND))
        (receipt-id (var-get next-receipt-id)))
        
        ;; Verify market is open
        (asserts! (get is-open market) ERR_MARKET_CLOSED)
        
        ;; Verify outcome ID is valid
        (asserts! (< outcome-id (len (get outcome-names market))) ERR_INVALID_OUTCOME)
        
        ;; Transfer STX to contract
        (try! (stx-transfer? amount sender CONTRACT))

        ;; Store receipt data without predictor field
        (map-set predictions receipt-id {
            market-id: market-id,
            outcome-id: outcome-id,
            amount: amount
        })
        
        ;; Mint NFT receipt
        (try! (nft-mint? prediction-receipt receipt-id sender))
        
        ;; Update outcome pools
        (let (
            (current-pools (get outcome-pools market))
            (current-pool (default-to u0 (element-at? current-pools outcome-id)))
            (updated-pool (+ current-pool amount))
            (updated-pools (replace-at? current-pools outcome-id updated-pool)))
            
            ;; Update market state
            (map-set markets market-id (merge market {
                outcome-pools: (unwrap-panic updated-pools),
                total-pool: (+ (get total-pool market) amount)
            }))
            
            ;; Increment receipt ID counter
            (var-set next-receipt-id (+ receipt-id u1))
            
            (ok {
                dx: market-id,
                dy: updated-pool,
                dk: receipt-id
            })
        )
    )
)

(define-public (claim-reward (receipt-id uint))
    (let (
        (sender tx-sender)
        (reward-quote (unwrap-panic (quote-reward receipt-id)))
        (total-reward (get dy reward-quote)))
        
        ;; Verify user owns the NFT receipt
        (asserts! (is-eq (some sender) (nft-get-owner? prediction-receipt receipt-id)) ERR_UNAUTHORIZED)

        ;; Verify has rewards
        (asserts! (> total-reward u0) ERR_NOT_WINNER)
        
        ;; Transfer reward to user
        (try! (as-contract (stx-transfer? total-reward CONTRACT sender)))
        
        ;; Burn the NFT receipt (marks as claimed)
        (try! (nft-burn? prediction-receipt receipt-id sender))
                
        (ok {
            dx: (get dx reward-quote),
            dy: total-reward,
            dk: receipt-id
        })
    )
)

;; --- Quote Functions ---

(define-read-only (quote-prediction (market-id uint) (outcome-id uint))
    (match (map-get? markets market-id)
        market 
        (if (not (get is-open market))
            (ok {
                dx: u0,
                dy: u0,
                dk: u0
            })
            (let (
                (outcome-pools (get outcome-pools market))
                (outcome-pool (default-to u0 (element-at? outcome-pools outcome-id))))
                (ok {
                    dx: market-id,
                    dy: outcome-pool,  ;; Current pool for this outcome
                    dk: (get total-pool market)  ;; Total pool across all outcomes
                })
            ))
        ERR_MARKET_NOT_FOUND)
)

(define-read-only (quote-reward (receipt-id uint))
    (let (
        (prediction (unwrap! (map-get? predictions receipt-id) ERR_PREDICTION_NOT_FOUND))
        (market-id (get market-id prediction))
        (market (unwrap! (map-get? markets market-id) ERR_MARKET_NOT_FOUND)))
        
        ;; Verify market is resolved
        (if (get is-resolved market)
            (let (
                (outcome-id (get outcome-id prediction))
                (amount (get amount prediction))
                (total-pot (get total-pool market))
                (winning-outcome (get winning-outcome market))
                (winning-pool (default-to u0 (element-at? (get outcome-pools market) winning-outcome))))
                
                ;; Calculate reward with fee deduction in one step to preserve precision
                ;; First multiply by (PRECISION - ADMIN_FEE) to apply 95% factor
                ;; Then divide by PRECISION to normalize
                ;; This is equivalent to: (amount * total_pot * 0.95) / winning_pool
                (let (
                    (net-reward (if (and (is-eq outcome-id winning-outcome) (> winning-pool u0)) 
                                  (/ (* (* amount total-pot) (- PRECISION ADMIN_FEE)) (* winning-pool PRECISION))
                                  u0)))
                    
                    (ok {
                        dx: market-id,
                        dy: net-reward,
                        dk: receipt-id
                    })
                )
            )
            (ok {
                dx: market-id,
                dy: u0,
                dk: u0
            })
        )
    )
)

;; --- Helper Functions ---

(define-read-only (get-byte (opcode (buff 16)) (position uint))
   (buff-to-uint-le (default-to 0x00 (element-at? opcode position))))

;; --- Admin Functions ---

(define-public (add-admin (admin principal))
    (begin
        (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
        (ok (map-set authorized-admins admin true))
    )
)

(define-public (remove-admin (admin principal))
    (begin
        (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
        (ok (map-set authorized-admins admin false))
    )
)

;; --- Market Info Functions ---

(define-read-only (get-market-info (market-id uint))
    (match (map-get? markets market-id)
        market (ok market)
        ERR_MARKET_NOT_FOUND)
)

(define-read-only (get-receipt-info (receipt-id uint))
    (match (map-get? predictions receipt-id)
        receipt 
        (match (nft-get-owner? prediction-receipt receipt-id)
            owner (ok (merge receipt { predictor: owner }))
            (err ERR_INVALID_TOKEN_ID))
        (err ERR_INVALID_TOKEN_ID))
)

;; --- Initialization ---
(begin
    ;; Initialize admin
    (map-set authorized-admins DEPLOYER true)
)`;
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

  /**
   * Generates a Hold-to-Earn contract for a given target contract
   */
  static generateHoldToEarn(config: HoldToEarnOptions): any {
    const contract = `
;; Title: Hold-to-Earn Engine for ${config.contractName}
;; Version: 1.0.0
;; Description: 
;;   Implementation of the Hold-to-Earn mechanism that rewards long-term holders
;;   by measuring their token balance over time and converting it to energy.

;; State
(define-data-var first-start-block uint stacks-block-height)
(define-map last-tap-block principal uint)

;; Balance Tracking
(define-private (get-balance (data { address: principal, block: uint }))
    (let ((target-block (get block data)))
        (if (< target-block stacks-block-height)
            (let ((block-hash (unwrap-panic (get-stacks-block-info? id-header-hash target-block))))
                (at-block block-hash (unwrap-panic (contract-call? '${config.targetContract} get-balance (get address data)))))
            (unwrap-panic (contract-call? '${config.targetContract} get-balance (get address data))))))

;; Trapezoid Area Calculations
${this.generateTrapezoidCalculations()}

;; Balance Integral Calculations
${this.generateBalanceIntegrals()}

;; Public Functions
(define-read-only (get-last-tap-block (address principal))
    (default-to (var-get first-start-block) (map-get? last-tap-block address)))

;; Engine Action Handler
(define-public (tap)
    (let (
        (sender tx-sender)
        (end-block stacks-block-height)
        (start-block (get-last-tap-block sender))
        (balance-integral (calculate-balance-integral sender start-block end-block))
        (incentive-score (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator get-incentive-score '${config.targetContract}))
        (supply (unwrap-panic (contract-call? '${config.targetContract} get-total-supply)))
        (potential-energy (/ (* balance-integral incentive-score) supply)))
        (map-set last-tap-block sender end-block)
        (match (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-rulebook-v0 energize potential-energy sender)
            success (handle-success sender potential-energy balance-integral (- end-block start-block))
            error   (err error))))

;; Response Handlers
(define-private (handle-success (sender principal) (energy uint) (integral uint) (block-period uint))
    (begin
        (print {op: "OP_HARVEST_ENERGY", sender: sender, energy: energy, integral: integral, message: "The tokens resonate with power, and produce energy for their holder."})
        (ok {dx: block-period, dy: integral, dk: energy})))`;

    const [, name] = config.contractId.split(".");

    return {
      contractName: name,
      codeBody: contract,
      network: Dexterity.config.network,
      postConditionMode: PostConditionMode.Deny,
      fee: 250000,
      clarityVersion: 3
    };
  }

  private static generateTrapezoidCalculations(): string {
    return `
(define-private (calculate-trapezoid-areas-39 (balances (list 39 uint)) (dx uint))
    (list
        (/ (* (+ (unwrap-panic (element-at balances u0)) (unwrap-panic (element-at balances u1))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u1)) (unwrap-panic (element-at balances u2))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u2)) (unwrap-panic (element-at balances u3))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u3)) (unwrap-panic (element-at balances u4))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u4)) (unwrap-panic (element-at balances u5))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u5)) (unwrap-panic (element-at balances u6))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u6)) (unwrap-panic (element-at balances u7))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u7)) (unwrap-panic (element-at balances u8))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u8)) (unwrap-panic (element-at balances u9))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u9)) (unwrap-panic (element-at balances u10))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u10)) (unwrap-panic (element-at balances u11))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u11)) (unwrap-panic (element-at balances u12))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u12)) (unwrap-panic (element-at balances u13))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u13)) (unwrap-panic (element-at balances u14))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u14)) (unwrap-panic (element-at balances u15))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u15)) (unwrap-panic (element-at balances u16))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u16)) (unwrap-panic (element-at balances u17))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u17)) (unwrap-panic (element-at balances u18))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u18)) (unwrap-panic (element-at balances u19))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u19)) (unwrap-panic (element-at balances u20))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u20)) (unwrap-panic (element-at balances u21))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u21)) (unwrap-panic (element-at balances u22))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u22)) (unwrap-panic (element-at balances u23))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u23)) (unwrap-panic (element-at balances u24))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u24)) (unwrap-panic (element-at balances u25))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u25)) (unwrap-panic (element-at balances u26))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u26)) (unwrap-panic (element-at balances u27))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u27)) (unwrap-panic (element-at balances u28))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u28)) (unwrap-panic (element-at balances u29))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u29)) (unwrap-panic (element-at balances u30))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u30)) (unwrap-panic (element-at balances u31))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u31)) (unwrap-panic (element-at balances u32))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u32)) (unwrap-panic (element-at balances u33))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u33)) (unwrap-panic (element-at balances u34))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u34)) (unwrap-panic (element-at balances u35))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u35)) (unwrap-panic (element-at balances u36))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u36)) (unwrap-panic (element-at balances u37))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u37)) (unwrap-panic (element-at balances u38))) dx) u2)))

(define-private (calculate-trapezoid-areas-19 (balances (list 19 uint)) (dx uint))
    (list
        (/ (* (+ (unwrap-panic (element-at balances u0)) (unwrap-panic (element-at balances u1))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u1)) (unwrap-panic (element-at balances u2))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u2)) (unwrap-panic (element-at balances u3))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u3)) (unwrap-panic (element-at balances u4))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u4)) (unwrap-panic (element-at balances u5))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u5)) (unwrap-panic (element-at balances u6))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u6)) (unwrap-panic (element-at balances u7))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u7)) (unwrap-panic (element-at balances u8))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u8)) (unwrap-panic (element-at balances u9))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u9)) (unwrap-panic (element-at balances u10))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u10)) (unwrap-panic (element-at balances u11))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u11)) (unwrap-panic (element-at balances u12))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u12)) (unwrap-panic (element-at balances u13))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u13)) (unwrap-panic (element-at balances u14))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u14)) (unwrap-panic (element-at balances u15))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u15)) (unwrap-panic (element-at balances u16))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u16)) (unwrap-panic (element-at balances u17))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u17)) (unwrap-panic (element-at balances u18))) dx) u2)))

(define-private (calculate-trapezoid-areas-9 (balances (list 9 uint)) (dx uint))
    (list
        (/ (* (+ (unwrap-panic (element-at balances u0)) (unwrap-panic (element-at balances u1))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u1)) (unwrap-panic (element-at balances u2))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u2)) (unwrap-panic (element-at balances u3))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u3)) (unwrap-panic (element-at balances u4))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u4)) (unwrap-panic (element-at balances u5))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u5)) (unwrap-panic (element-at balances u6))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u6)) (unwrap-panic (element-at balances u7))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u7)) (unwrap-panic (element-at balances u8))) dx) u2)))

(define-private (calculate-trapezoid-areas-5 (balances (list 5 uint)) (dx uint))
    (list
        (/ (* (+ (unwrap-panic (element-at balances u0)) (unwrap-panic (element-at balances u1))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u1)) (unwrap-panic (element-at balances u2))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u2)) (unwrap-panic (element-at balances u3))) dx) u2)
        (/ (* (+ (unwrap-panic (element-at balances u3)) (unwrap-panic (element-at balances u4))) dx) u2)))

(define-private (calculate-trapezoid-areas-2 (balances (list 2 uint)) (dx uint))
    (list
        (/ (* (+ (unwrap-panic (element-at balances u0)) (unwrap-panic (element-at balances u1))) dx) u2)))`;
  }

  private static generateBalanceIntegrals(): string {
    return `
(define-private (calculate-balance-integral-39 (address principal) (start-block uint) (end-block uint))
    (let (
        (sample-points (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator generate-sample-points-39 address start-block end-block))
        (balances (map get-balance sample-points))
        (dx (/ (- end-block start-block) u38))
        (areas (calculate-trapezoid-areas-39 balances dx)))
        (fold + areas u0)))

(define-private (calculate-balance-integral-19 (address principal) (start-block uint) (end-block uint))
    (let (
        (sample-points (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator generate-sample-points-19 address start-block end-block))
        (balances (map get-balance sample-points))
        (dx (/ (- end-block start-block) u18))
        (areas (calculate-trapezoid-areas-19 balances dx)))
        (fold + areas u0)))

(define-private (calculate-balance-integral-9 (address principal) (start-block uint) (end-block uint))
    (let (
        (sample-points (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator generate-sample-points-9 address start-block end-block))
        (balances (map get-balance sample-points))
        (dx (/ (- end-block start-block) u8))
        (areas (calculate-trapezoid-areas-9 balances dx)))
        (fold + areas u0)))

(define-private (calculate-balance-integral-5 (address principal) (start-block uint) (end-block uint))
    (let (
        (sample-points (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator generate-sample-points-5 address start-block end-block))
        (balances (map get-balance sample-points))
        (dx (/ (- end-block start-block) u4))
        (areas (calculate-trapezoid-areas-5 balances dx)))
        (fold + areas u0)))

(define-private (calculate-balance-integral-2 (address principal) (start-block uint) (end-block uint))
    (let (
        (sample-points (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator generate-sample-points-2 address start-block end-block))
        (balances (map get-balance sample-points))
        (dx (/ (- end-block start-block) u1))
        (areas (calculate-trapezoid-areas-2 balances dx)))
        (fold + areas u0)))

(define-private (calculate-balance-integral (address principal) (start-block uint) (end-block uint))
    (let (
        (block-difference (- end-block start-block))
        (thresholds (unwrap-panic (contract-call? 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.engine-coordinator get-thresholds))))
        (if (>= block-difference (get threshold-39-point thresholds)) (calculate-balance-integral-39 address start-block end-block)
        (if (>= block-difference (get threshold-19-point thresholds)) (calculate-balance-integral-19 address start-block end-block)
        (if (>= block-difference (get threshold-9-point thresholds)) (calculate-balance-integral-9 address start-block end-block)
        (if (>= block-difference (get threshold-5-point thresholds)) (calculate-balance-integral-5 address start-block end-block)
        (calculate-balance-integral-2 address start-block end-block)))))))`;
  }
} 