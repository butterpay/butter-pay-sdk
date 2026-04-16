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
   * 2. Get payment session token (binds invoice to payer wallet)
   * 3. Approve token
   * 4. Call PaymentRouter.pay()
   * 5. Submit txHash to API for tracking (with sessionToken)
   * 6. Optionally wait for confirmation
   */
  async pay(params: {
    amount: string;
    token: string;
    chain: ChainName;
    merchantAddress: Address;
    paymentRouterAddress: Address;
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
      amountUsd: params.amount,
      chain: params.chain,
      description: params.description,
      merchantOrderId: params.merchantOrderId,
      metadata: params.metadata,
    });

    // 2. Get payment session token
    const sessionToken = await this.api.getPaymentSession(invoice.id, address);

    // 3. Compute bytes32 invoice ID for contract
    const invoiceIdBytes32 = keccak256(toHex(invoice.id));

    // 4. Execute payment on-chain
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 min
    const result = await this.cryptoProvider.pay({
      invoiceId: invoice.id,
      chain: params.chain,
      token: params.token,
      amount: params.amount,
      merchantAddress: params.merchantAddress,
      paymentRouterAddress: params.paymentRouterAddress,
      invoiceIdBytes32,
      serviceFeeBps: params.serviceFeeBps,
      referrer: params.referrer,
      referrerFeeBps: params.referrerFeeBps,
      deadline,
    });

    // 5. Submit tx for tracking (with sessionToken)
    await this.api.submitTransaction(invoice.id, {
      sessionToken,
      txHash: result.txHash,
      payerAddress: address,
      toAddress: params.paymentRouterAddress,
      chain: params.chain,
      token: params.token,
    });

    // 6. Optionally wait
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
