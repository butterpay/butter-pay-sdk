import { keccak256, toHex, type Address, type Hash } from "viem";
import { ApiClient, type ApiClientConfig } from "./api-client.js";
import { CryptoPaymentProvider } from "./providers/crypto-provider.js";
import type {
  WalletAdapter,
  ChainName,
  ChainConfig,
  BalanceInfo,
  Invoice,
} from "./types.js";

export interface ButterPayConfig {
  /** ButterPay API base URL */
  apiUrl: string;
  /** Merchant API key (optional, for server-side usage) */
  apiKey?: string;
  /** Wallet adapter to use */
  wallet: WalletAdapter;
  /** Chain config overrides */
  chains?: Partial<Record<ChainName, Partial<ChainConfig>>>;
}

/**
 * Main entry point for the ButterPay SDK.
 * Orchestrates wallet, payment provider, and API client.
 */
export class ButterPay {
  private api: ApiClient;
  private wallet: WalletAdapter;
  private cryptoProvider: CryptoPaymentProvider;

  constructor(config: ButterPayConfig) {
    this.api = new ApiClient({
      baseUrl: config.apiUrl,
      apiKey: config.apiKey,
    });
    this.wallet = config.wallet;
    this.cryptoProvider = new CryptoPaymentProvider(
      config.wallet,
      config.chains
    );
  }

  // ========================= Wallet =========================

  /** Connect wallet and return address */
  async connect(): Promise<Address> {
    return this.wallet.connect();
  }

  /** Get connected address */
  getAddress(): Address | null {
    return this.wallet.getAddress();
  }

  /** Scan balances across all chains */
  async scanBalances(): Promise<BalanceInfo[]> {
    const address = this.wallet.getAddress();
    if (!address) throw new Error("Wallet not connected");
    return this.cryptoProvider.scanBalances(address);
  }

  // ========================= Payment =========================

  /**
   * Full payment flow:
   * 1. Create invoice via API
   * 2. Approve token
   * 3. Call PaymentReceiver.pay()
   * 4. Submit txHash to API for tracking
   * 5. Optionally wait for confirmation
   */
  async pay(params: {
    amount: string;
    token: string;
    chain: ChainName;
    merchantAddress: Address;
    paymentReceiverAddress: Address;
    serviceFeeBps: number;
    referrer?: Address;
    referrerFeeBps?: number;
    description?: string;
    merchantOrderId?: string;
    metadata?: Record<string, unknown>;
    waitForConfirmation?: boolean;
  }): Promise<{ invoice: Invoice; txHash: Hash }> {
    const address = this.wallet.getAddress();
    if (!address) throw new Error("Wallet not connected");

    // 1. Create invoice
    const invoice = await this.api.createInvoice({
      amount: params.amount,
      token: params.token,
      chain: params.chain,
      description: params.description,
      merchantOrderId: params.merchantOrderId,
      metadata: params.metadata,
    });

    // 2. Compute bytes32 invoice ID for contract
    const invoiceIdBytes32 = keccak256(toHex(invoice.id));

    // 3. Execute payment on-chain
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 min
    const result = await this.cryptoProvider.pay({
      invoiceId: invoice.id,
      chain: params.chain,
      token: params.token,
      amount: params.amount,
      merchantAddress: params.merchantAddress,
      paymentReceiverAddress: params.paymentReceiverAddress,
      invoiceIdBytes32,
      serviceFeeBps: params.serviceFeeBps,
      referrer: params.referrer,
      referrerFeeBps: params.referrerFeeBps,
      deadline,
    });

    // 4. Submit tx for tracking
    await this.api.submitTransaction(invoice.id, {
      txHash: result.txHash,
      payerAddress: address,
      toAddress: params.paymentReceiverAddress,
    });

    // 5. Optionally wait
    if (params.waitForConfirmation) {
      const confirmed = await this.api.waitForConfirmation(invoice.id);
      return { invoice: confirmed, txHash: result.txHash };
    }

    return { invoice, txHash: result.txHash };
  }

  // ========================= Invoice Query =========================

  async getInvoice(invoiceId: string): Promise<Invoice> {
    return this.api.getInvoice(invoiceId);
  }

  async waitForConfirmation(invoiceId: string): Promise<Invoice> {
    return this.api.waitForConfirmation(invoiceId);
  }
}
