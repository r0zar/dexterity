import {
  makeContractDeploy,
  broadcastTransaction,
  PostConditionMode,
  Pc,
  TxBroadcastResult
} from "@stacks/transactions";
import { Dexterity } from "./sdk";
import { ErrorUtils } from "../utils";
import { ERROR_CODES } from "../utils/constants";

const deploymentFee = 50000000; // 50 STX

/**
 * Interface for deployment results
 */
export interface DeploymentResult {
  success: boolean;
  error?: string;
  txId?: string;
  contractId?: string;
}

/**
 * Interface for subnet wrapper contract parameters
 */
export interface SubnetWrapperParams {
  tokenContract: string;      // Original token contract ID to wrap
  versionName: string;        // Subnet name (lowercase, no spaces)
  versionNumber: string;      // Version like v1, rc1
  batchSize: number;          // Max operations per batch
  description?: string;       // Optional description
}

/**
 * Validate the subnet wrapper parameters
 */
export function validateWrapperParams(params: SubnetWrapperParams): void {
  // Validate tokenContract
  if (!params.tokenContract) {
    throw new Error("Token contract ID is required");
  }

  if (!params.tokenContract.includes('.')) {
    throw new Error("Token contract ID must be in format 'address.contract-name'");
  }

  // Validate versionName
  if (!params.versionName) {
    throw new Error("Version name is required");
  }

  if (!/^[a-z0-9-]+$/.test(params.versionName)) {
    throw new Error("Version name must only contain lowercase letters, numbers, and hyphens");
  }

  if (params.versionName.length < 3) {
    throw new Error("Version name must be at least 3 characters");
  }

  // Validate versionNumber
  if (!params.versionNumber) {
    throw new Error("Version number is required");
  }

  if (!/^(v|rc)\d+(\.\d+)*$/.test(params.versionNumber)) {
    throw new Error("Version number must start with 'v' or 'rc' followed by numbers (e.g., v1, rc1, v1.0)");
  }

  // Validate batchSize
  if (typeof params.batchSize !== 'number' || params.batchSize < 50 || params.batchSize > 300) {
    throw new Error("Batch size must be a number between 50 and 300");
  }
}

/**
 * Generate a subnet wrapper contract for an existing token
 */
export function generateSubnetWrapper(params: SubnetWrapperParams): string {
  // Validate parameters
  validateWrapperParams(params);

  // Format tokenContractId for contract calls
  const formattedTokenContract = `'${params.tokenContract}`;

  // Combine the version name and number
  const fullVersion = `${params.versionName}-${params.versionNumber}`;

  // Use provided description or create a default one
  const description = params.description ||
    `Subnet token for ${params.tokenContract} with fast off-chain transactions`;

  // Generate the contract code
  return `;; title: blaze subnet
;; authors: rozar.btc, brice.btc, charisma.rocks
;; version: ${fullVersion}
;; summary: ${description}

;; Platform constants
(define-constant fee-recipient-address 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS)
(define-constant deployment-fee u${deploymentFee})

;; Constants for SIP-018 structured data
(define-constant structured-data-prefix 0x534950303138)
(define-constant message-domain-hash (sha256 (unwrap-panic (to-consensus-buff?
  {
    name: "blaze",
    version: "${fullVersion}",
    chain-id: chain-id
  }
))))
(define-constant structured-data-header (concat structured-data-prefix message-domain-hash))

;; Errors
(define-constant ERR_INSUFFICIENT_BALANCE (err u100))
(define-constant ERR_INVALID_SIGNATURE (err u101))
(define-constant ERR_NONCE_TOO_LOW (err u102))
(define-constant ERR_CONSENSUS_BUFF (err u103))
(define-constant ERR_TOO_MANY_OPERATIONS (err u104))
(define-constant ERR_UNAUTHORIZED (err u105))
(define-constant ERR_TRANSFER_FAILED (err u106))

;; Constants
(define-constant MAX_BATCH_SIZE u${params.batchSize})

;; Maps
(define-map balances { owner: principal } { amount: uint })
(define-map nonces principal uint)

;; Initialization block - only runs once on contract deployment
(begin
  ;; If the deployer is not the platform owner, transfer deployment fee
  (if (not (is-eq tx-sender fee-recipient-address))
    ;; Transfer fee if tx-sender is not the platform owner
    (stx-transfer? deployment-fee tx-sender fee-recipient-address)
    (ok true)
  )
)

;; Public Functions

;; Deposit tokens and receive credits
(define-public (deposit (amount uint))
  (let
    (
      (sender tx-sender)
      (balance-key { owner: sender })
      (current-balance (default-to { amount: u0 } (map-get? balances balance-key)))
    )
    ;; First transfer tokens to contract
    (try! (contract-call? ${formattedTokenContract} transfer amount sender (as-contract tx-sender) none))
    
    ;; Then credit the balance
    (map-set balances balance-key
      { amount: (+ (get amount current-balance) amount) }
    )
    
    (print {
      event: "deposit",
      user: sender,
      amount: amount
    })
    (ok true)
  )
)

;; Withdraw tokens by spending credits
(define-public (withdraw (amount uint))
  (let
    (
      (sender tx-sender)
      (balance-key { owner: sender })
      (current-balance (default-to { amount: u0 } (map-get? balances balance-key)))
    )
    ;; Check sufficient balance
    (asserts! (>= (get amount current-balance) amount) ERR_INSUFFICIENT_BALANCE)
    
    ;; First reduce the credit balance
    (map-set balances balance-key
      { amount: (- (get amount current-balance) amount) }
    )
    
    ;; Then transfer tokens from contract
    (try! (as-contract (contract-call? ${formattedTokenContract} transfer amount tx-sender sender none)))
    
    (print {
      event: "withdraw",
      user: sender,
      amount: amount
    })
    (ok true)
  )
)

;; Standard SIP-010 compatible transfer function
(define-public (transfer (amount uint) (from principal) (to principal) (memo (optional (buff 34))))
  (let 
    (
      (sender tx-sender)
      (from-balance-key { owner: sender })
      (to-balance-key { owner: to })
      (current-from-balance (default-to { amount: u0 } (map-get? balances from-balance-key)))
      (current-to-balance (default-to { amount: u0 } (map-get? balances to-balance-key)))
    )
    ;; Auth check from sender
    (asserts! (is-eq sender from) ERR_UNAUTHORIZED)

    ;; Check balance
    (asserts! (>= (get amount current-from-balance) amount) ERR_INSUFFICIENT_BALANCE)
    
    ;; Update balances
    (map-set balances from-balance-key
      { amount: (- (get amount current-from-balance) amount) }
    )
    (map-set balances to-balance-key
      { amount: (+ (get amount current-to-balance) amount) }
    )
    
    (print {
      event: "transfer",
      from: sender,
      to: to,
      amount: amount,
      memo: memo
    })
    (ok true)
  )
)

;; Transfer credits between users using cryptographic signatures (off-chain)
(define-public (signed-transfer
  (signet {signature: (buff 65), nonce: uint})
  (to principal)
  (amount uint)
)
  (let 
    (
      (nonce (get nonce signet))
      (signer-principal (unwrap! (verify-transfer-signer signet to amount) ERR_INVALID_SIGNATURE))
      (from-balance-key { owner: signer-principal })
      (to-balance-key { owner: to })
      (current-from-balance (default-to { amount: u0 } (map-get? balances from-balance-key)))
      (current-to-balance (default-to { amount: u0 } (map-get? balances to-balance-key)))
      (current-nonce (default-to u0 (map-get? nonces signer-principal)))
    )
    ;; Verify nonce
    (asserts! (> nonce current-nonce) ERR_NONCE_TOO_LOW)
    
    ;; Check balance
    (asserts! (>= (get amount current-from-balance) amount) ERR_INSUFFICIENT_BALANCE)
    
    ;; Update balances
    (map-set balances from-balance-key
      { amount: (- (get amount current-from-balance) amount) }
    )
    (map-set balances to-balance-key
      { amount: (+ (get amount current-to-balance) amount) }
    )
    
    ;; Update nonce
    (map-set nonces signer-principal nonce)
    
    (print {
      event: "signed-transfer",
      from: signer-principal,
      to: to,
      amount: amount,
      nonce: nonce
    })
    (ok true)
  )
)

;; Batch credit transfers with success/failure tracking
(define-public (batch-transfer
    (operations (list ${params.batchSize} {
      signet: {signature: (buff 65), nonce: uint},
      to: principal,
      amount: uint,
    }))
  )
  (let
    (
      (results (map try-transfer operations))
    )
    (asserts! (<= (len operations) MAX_BATCH_SIZE) ERR_TOO_MANY_OPERATIONS)
    (ok results)
  )
)

;; SIP-010 compatibility functions
(define-read-only (get-name)
  (contract-call? ${formattedTokenContract} get-name)
)

(define-read-only (get-symbol)
  (contract-call? ${formattedTokenContract} get-symbol)
)

(define-read-only (get-decimals)
  (contract-call? ${formattedTokenContract} get-decimals)
)

(define-read-only (get-token-uri)
  (contract-call? ${formattedTokenContract} get-token-uri)
)

(define-read-only (get-total-supply)
  (contract-call? ${formattedTokenContract} get-total-supply)
)

;; Read-only functions

(define-read-only (get-balance (owner principal))
  (get amount (default-to { amount: u0 }
    (map-get? balances { owner: owner })))
)

(define-read-only (get-nonce (owner principal))
  (default-to u0 (map-get? nonces owner))
)

;;; Generate a hash of the structured data for a transfer.
;;; Returns:
;;; - (ok (buff 32)) with the hash of the structured data on success
;;; - \`ERR_CONSENSUS_BUFF\` if the structured data cannot be converted to a
;;;   consensus buff
(define-read-only (make-structured-data-hash
    (to principal)
    (amount uint)
    (nonce uint)
  )
  (let (
      (structured-data { to: to, amount: amount, nonce: nonce })
      (data-hash (sha256 (unwrap! (to-consensus-buff? structured-data) ERR_CONSENSUS_BUFF)))
    )
    (ok (sha256 (concat structured-data-header data-hash)))
  )
)

;;; Recovers a principal from a signature and message hash
;;; Returns:
;;; - (ok principal) with the address of the signer
;;; - ERR_INVALID_SIGNATURE if recovery fails
(define-read-only (get-signer
    (hash (buff 32))
    (signature (buff 65))
  )
  (match (secp256k1-recover? hash signature)
    public-key (principal-of? public-key)
    error ERR_INVALID_SIGNATURE
  )
)

;;; Verify a transfer signet and return the signer principal
;;; This is a convenience function that combines make-structured-data-hash and get-signer
;;; for token transfer verification
;;; Returns:
;;; - (ok principal) with the address of the signer for the given signet + transfer params
;;; - Error if signature verification fails
(define-read-only (verify-transfer-signer
    (signet {signature: (buff 65), nonce: uint})
    (to principal)
    (amount uint)
  )
  (let (
    (signature (get signature signet))
    (nonce (get nonce signet))
    (hash (unwrap! (make-structured-data-hash to amount nonce) ERR_CONSENSUS_BUFF))
  )
    (get-signer hash signature)
  )
)

(define-private (try-transfer
    (operation {
      signet: {signature: (buff 65), nonce: uint},
      to: principal,
      amount: uint,
    })
  )
  (match (signed-transfer
    (get signet operation)
    (get to operation)
    (get amount operation)
  )
    success true
    error false
  )
)`;
}

/**
 * Get wrapper contract name from parameters
 */
export function getWrapperContractName(params: SubnetWrapperParams): string {
  // Sanitize and combine the version name and number
  const fullVersion = `${params.versionName}-${params.versionNumber}`;
  return `blaze-${fullVersion.toLowerCase()}`;
}

/**
 * Generate subnet wrapper contract code and return contract details
 * @param params Subnet wrapper parameters
 * @param address Optional STX address override for contractId
 * @returns Object with code, contractName, and contractId
 */
export function generateSubnetCode(
  params: SubnetWrapperParams,
  address?: string
): { code: string; contractName: string; contractId: string } {
  // Validate parameters
  validateWrapperParams(params);

  // Use provided address or default
  const stxAddress = address || Dexterity.config.stxAddress;

  // Generate contract code
  const code = generateSubnetWrapper(params);

  // Get contract name
  const contractName = getWrapperContractName(params);

  // Create the contractId
  const contractId = `${stxAddress}.${contractName}`;

  return {
    code,
    contractName,
    contractId
  };
}

/**
 * Build deployment configuration for a subnet-wrapper contract
 */
export function getWrapperDeployConfig(code: string, contractName: string): any {
  return {
    contractName,
    codeBody: code,
    network: Dexterity.config.network,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      // Platform owner is waived the fee, everyone else pays 50 STX
      Dexterity.config.stxAddress !== 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS'
        ? Pc.principal(Dexterity.config.stxAddress).willSendEq(deploymentFee).ustx()
        : undefined
    ].filter(Boolean),
    fee: 50000, // 0.05 STX tx fee
    clarityVersion: 3
  };
}

/**
 * Deploy a subnet-wrapper contract for an existing token
 * @param params Subnet wrapper parameters
 * @param credentials Optional override for privateKey and stxAddress
 * @returns Promise resolving to the deployment result
 */
export async function deploySubnetWrapper(
  params: SubnetWrapperParams,
  credentials?: { privateKey?: string; stxAddress?: string }
): Promise<DeploymentResult> {
  try {
    // Use provided credentials or SDK defaults
    const privateKey = credentials?.privateKey || Dexterity.config.privateKey;
    const stxAddress = credentials?.stxAddress || Dexterity.config.stxAddress;

    // Validate parameters
    validateWrapperParams(params);

    // Generate contract code
    const contractCode = generateSubnetWrapper(params);

    // Get contract name
    const contractName = getWrapperContractName(params);

    // Create the contractId using the appropriate address
    const contractId = `${stxAddress}.${contractName}`;

    // Build the deployment configuration
    const deployConfig = getWrapperDeployConfig(contractCode, contractName);

    // Deploy the contract based on the mode
    if (Dexterity.config.mode === "server") {
      if (!privateKey) {
        return {
          success: false,
          error: "Private key is required for server-side deployment"
        };
      }

      const transaction = await makeContractDeploy({
        ...deployConfig,
        senderKey: privateKey,
      });

      const result = await broadcastTransaction({ transaction });

      return {
        success: true,
        txId: result.txid,
        contractId
      };
    } else {
      // Client-side: prepare the configuration for wallet to deploy
      // This will be used by connectWallet in the UI
      return {
        success: true,
        contractId,
        deployConfig
      } as any;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error deploying subnet wrapper"
    };
  }
}