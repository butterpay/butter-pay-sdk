import type { Address, Hash, Chain as ViemChain } from "viem";

// ========================= Chains =========================

export type ChainName = "ethereum" | "arbitrum" | "bsc" | "polygon" | "arbitrumSepolia";

export interface ChainConfig {
  name: ChainName;
  viemChain: ViemChain;
  rpcUrl: string;
  paymentRouterAddress: Address;
  /** SubscriptionManager contract address (zero address if not deployed on this chain) */
  subscriptionManagerAddress?: Address;
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
  paymentRouterAddress: Address;
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
  merchantName?: string;
  merchantOrderId?: string;
  merchantReceivingAddresses?: Record<string, string>;
  amount: string;
  token: string;
  chain: string;
  status: string;
  paymentMethod?: string;
  payerAddress?: string;
  txHash?: string;
  serviceFee?: string;
  merchantReceived?: string;
  description?: string;
  expiresAt?: string;
  redirectUrl?: string;
  createdAt: string;
  /** Hosted web payment page URL — present on the create response. */
  payUrl?: string;
  /**
   * Telegram Mini App payment link — present on the create response
   * iff the backend has TG_BOT_USERNAME configured. Same payment id
   * as `payUrl`, just routed through Telegram instead of the browser.
   */
  tgPayUrl?: string;
}

export interface BalanceInfo {
  chain: ChainName;
  token: string;
  balance: string; // human-readable decimal
  rawBalance: bigint;
}

// ========================= Subscriptions =========================

export interface Plan {
  id: string;
  merchantId: string;
  merchantName?: string;
  merchantReceivingAddresses?: Record<string, string>;
  name: string;
  description?: string;
  amountUsd: string;
  interval: number;      // seconds
  cycles: number;        // total billing cycles
  chain: string;
  token: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Subscription {
  id: string;
  merchantId: string;
  planId?: string;
  subscriberAddress: string;
  chain: string;
  token: string;
  amount: string;
  interval: number;
  cyclesTotal: number;
  cyclesCharged: number;
  onChainId?: number;
  status: "active" | "cancelled" | "expired" | "completed" | "past_due";
  nextChargeAt?: string;
  lastChargedAt?: string;
  expiresAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface SubscribeParams {
  plan: Plan;
  /** Subscriber wallet address (must match connected wallet) */
  subscriberAddress: Address;
  /** SubscriptionManager contract address on the plan's chain */
  subscriptionManagerAddress: Address;
  /** Expiry as unix timestamp (0 = no expiry; defaults to now + interval * cycles) */
  expiry?: number;
}

export interface SubscribeResult {
  subscription: Subscription;
  onChainId: number;
  approveTxHash?: Hash;
  subscribeTxHash: Hash;
  chain: ChainName;
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
