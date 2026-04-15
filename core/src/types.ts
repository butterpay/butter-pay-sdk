import type { Address, Hash, Chain as ViemChain } from "viem";

// ========================= Chains =========================

export type ChainName = "ethereum" | "arbitrum" | "bsc" | "polygon" | "optimism";

export interface ChainConfig {
  name: ChainName;
  viemChain: ViemChain;
  rpcUrl: string;
  paymentReceiverAddress: Address;
  tokens: TokenConfig[];
  blockExplorerUrl: string;
}

export interface TokenConfig {
  symbol: string;
  address: Address;
  decimals: number;
}

// ========================= Wallet =========================

export interface WalletAdapter {
  /** Connect/unlock the wallet, return the active address */
  connect(): Promise<Address>;

  /** Disconnect/lock */
  disconnect(): Promise<void>;

  /** Get connected address, null if not connected */
  getAddress(): Address | null;

  /** Check if connected */
  isConnected(): boolean;

  /** Sign and send a transaction, return tx hash */
  sendTransaction(tx: TransactionRequest): Promise<Hash>;

  /** Sign typed data (EIP-712) */
  signTypedData?(params: SignTypedDataParams): Promise<Hash>;

  /** Get the adapter type for display */
  readonly type: "hd" | "walletconnect" | "tonconnect" | "external";
}

export interface TransactionRequest {
  to: Address;
  data?: `0x${string}`;
  value?: bigint;
  chainId?: number;
  gas?: bigint;
}

export interface SignTypedDataParams {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}

// ========================= Payment =========================

export type PaymentMethod = "crypto" | "fiat";

export interface PaymentProvider {
  readonly method: PaymentMethod;

  /** Execute payment for an invoice */
  pay(params: PayParams): Promise<PayResult>;
}

export interface PayParams {
  invoiceId: string;
  chain: ChainName;
  token: string;
  amount: string; // human-readable decimal
  merchantAddress: Address;
  paymentReceiverAddress: Address;
  invoiceIdBytes32: `0x${string}`; // bytes32 invoice ID for contract
  serviceFeeBps: number;
  referrer?: Address;
  referrerFeeBps?: number;
  deadline: number; // unix timestamp
}

export interface PayResult {
  txHash: Hash;
  chain: ChainName;
  status: "submitted" | "confirmed" | "failed";
}

// ========================= API =========================

export interface Invoice {
  id: string;
  merchantId: string;
  merchantOrderId?: string;
  amount: string;
  token: string;
  chain: string;
  status: string;
  paymentMethod?: string;
  payerAddress?: string;
  txHash?: string;
  serviceFee?: string;
  merchantReceived?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface BalanceInfo {
  chain: ChainName;
  token: string;
  balance: string; // human-readable decimal
  rawBalance: bigint;
}

// ========================= HD Wallet =========================

export interface HDWalletConfig {
  /** Password for encrypting the keystore */
  password?: string;
  /** Pre-existing mnemonic to import */
  mnemonic?: string;
}

export interface Keystore {
  /** Encrypted mnemonic (AES-256-GCM) */
  ciphertext: string;
  /** Argon2 salt (hex) */
  salt: string;
  /** AES-GCM IV (hex) */
  iv: string;
  /** Version for future compat */
  version: number;
}
