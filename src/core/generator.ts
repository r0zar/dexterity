import {
  broadcastTransaction,
  makeContractDeploy,
  PostConditionMode,
  TxBroadcastResult,
} from "@stacks/transactions";
import { openContractDeploy } from "@stacks/connect";
import type { LPToken } from "../types";
import { Dexterity } from "./sdk";

export class ContractGenerator {
  /**
   * Deploy contract
   */
  static async deployContract(
    config: LPToken
  ): Promise<TxBroadcastResult | void> {
    const contractSource = this.generateContractCode(config);
    const [, name] = config.contractId.split(".");
    // Deploy contract based on mode
    if (Dexterity.config.mode === "server") {
      // Server-side: deploy contract with senderKey
      const transaction = await makeContractDeploy({
        senderKey: Dexterity.config.privateKey,
        contractName: name,
        codeBody: contractSource,
        network: Dexterity.config.network,
        postConditionMode: PostConditionMode.Allow,
        fee: 400000,
        clarityVersion: 3,
      });
      return broadcastTransaction({ transaction });
    } else {
      // Client-side: deploy contract with wallet signature
      await openContractDeploy({
        contractName: name,
        codeBody: contractSource,
        postConditionMode: PostConditionMode.Allow,
        network: Dexterity.config.network,
        fee: 400000,
        clarityVersion: 3,
      });
    }
  }

  static generateContractCode(config: LPToken): string {
    const contractId = config.contractId;
    const tokenAContract = config.liquidity[0].contractId;
    const tokenBContract = config.liquidity[1].contractId;
    const lpTokenName = config.name;
    const lpTokenSymbol = config.symbol;
    const lpRebatePercent = config.fee;
    const initialLiquidityA = config.liquidity[0].reserves;
    const initialLiquidityB = config.liquidity[1].reserves;

    // Check which token is STX (if any)
    const isTokenAStx = tokenAContract === ".stx";
    const isTokenBStx = tokenBContract === ".stx";

    const lpRebateRaw = Math.floor(
      (parseFloat(lpRebatePercent.toString()) / 100) * 1000000
    );

    // Determine initial liquidity distribution
    const baseAmount = Math.min(initialLiquidityA, initialLiquidityB);
    const additionalTokenA = Math.max(0, initialLiquidityA - baseAmount);
    const additionalTokenB = Math.max(0, initialLiquidityB - baseAmount);

    // Helper function to generate transfer code based on token type
    const generateTransferIn = (
      isStx: boolean,
      tokenContract: string,
      amount: string,
      sender: string,
      recipient: string
    ) =>
      isStx
        ? `(try! (stx-transfer? ${amount} ${sender} ${recipient}))`
        : `(try! (contract-call? '${tokenContract} transfer ${amount} ${sender} ${recipient} none))`;

    const generateTransferOut = (
      isStx: boolean,
      tokenContract: string,
      amount: string,
      sender: string,
      recipient: string
    ) =>
      isStx
        ? `(try! (as-contract (stx-transfer? ${amount} ${sender} ${recipient})))`
        : `(try! (as-contract (contract-call? '${tokenContract} transfer ${amount} ${sender} ${recipient} none)))`;

    const getBalance = (
      isStx: boolean,
      tokenContract: string,
      owner: string
    ) =>
      isStx
        ? `(stx-get-balance ${owner})`
        : `(unwrap-panic (contract-call? '${tokenContract} get-balance ${owner}))`;

    const mainContract = `;; Title: ${lpTokenName}
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

;; Operation Types (Byte 0 of opcode)
(define-constant OP_SWAP_A_TO_B 0x00)     ;; Swap token A for B
(define-constant OP_SWAP_B_TO_A 0x01)     ;; Swap token B for A
(define-constant OP_ADD_LIQUIDITY 0x02)   ;; Add liquidity
(define-constant OP_REMOVE_LIQUIDITY 0x03) ;; Remove liquidity

;; Define LP token
(define-fungible-token ${lpTokenSymbol})
(define-data-var token-uri (optional (string-utf8 256)) (some u"https://charisma.rocks/api/v0/metadata/${contractId}"))

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
        ERR_INVALID_OPERATION))))))

;; --- Core Functions ---

(define-private (swap-a-to-b (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-swap-quote amount (some OP_SWAP_A_TO_B))))
        ;; Transfer token A to pool
        ${generateTransferIn(
          isTokenAStx,
          tokenAContract,
          "amount",
          "sender",
          "CONTRACT"
        )}
        ;; Transfer token B to sender
        ${generateTransferOut(
          isTokenBStx,
          tokenBContract,
          "(get dy delta)",
          "CONTRACT",
          "sender"
        )}
        (ok delta)))

(define-private (swap-b-to-a (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-swap-quote amount (some OP_SWAP_B_TO_A))))
        ;; Transfer token B to pool
        ${generateTransferIn(
          isTokenBStx,
          tokenBContract,
          "amount",
          "sender",
          "CONTRACT"
        )}
        ;; Transfer token A to sender
        ${generateTransferOut(
          isTokenAStx,
          tokenAContract,
          "(get dy delta)",
          "CONTRACT",
          "sender"
        )}
        (ok delta)))

(define-private (add-liquidity (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-liquidity-quote amount)))
        ${generateTransferIn(
          isTokenAStx,
          tokenAContract,
          "(get dx delta)",
          "sender",
          "CONTRACT"
        )}
        ${generateTransferIn(
          isTokenBStx,
          tokenBContract,
          "(get dy delta)",
          "sender",
          "CONTRACT"
        )}
        (try! (ft-mint? ${lpTokenSymbol} (get dk delta) sender))
        (ok delta)))

(define-private (remove-liquidity (amount uint))
    (let (
        (sender tx-sender)
        (delta (get-liquidity-quote amount)))
        (try! (ft-burn? ${lpTokenSymbol} (get dk delta) sender))
        ${generateTransferOut(
          isTokenAStx,
          tokenAContract,
          "(get dx delta)",
          "CONTRACT",
          "sender"
        )}
        ${generateTransferOut(
          isTokenBStx,
          tokenBContract,
          "(get dy delta)",
          "CONTRACT",
          "sender"
        )}
        (ok delta)))

;; --- Helper Functions ---

(define-private (get-byte (opcode (optional (buff 16))) (position uint))
    (default-to 0x00 (element-at? (default-to 0x00 opcode) position)))

(define-private (get-reserves)
    { 
      a: ${getBalance(isTokenAStx, tokenAContract, "CONTRACT")}, 
      b: ${getBalance(isTokenBStx, tokenBContract, "CONTRACT")}
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

;; --- Initialization ---
(begin
    ;; Add initial balanced liquidity (handles both token transfers at 1:1)
    (try! (add-liquidity u${baseAmount}))`;

    // Add additional token transfers if needed
    let initializationBlock = ``;

    if (additionalTokenA > 0) {
      initializationBlock += `
    
    ;; Transfer additional token A to achieve desired ratio
    ${generateTransferIn(
      isTokenAStx,
      tokenAContract,
      `u${additionalTokenA}`,
      "tx-sender",
      "CONTRACT"
    )}`;
    }

    if (additionalTokenB > 0) {
      initializationBlock += `
    
    ;; Transfer additional token B to achieve desired ratio
    ${generateTransferIn(
      isTokenBStx,
      tokenBContract,
      `u${additionalTokenB}`,
      "tx-sender",
      "CONTRACT"
    )}`;
    }

    return mainContract + initializationBlock + `)`;
  }
}
