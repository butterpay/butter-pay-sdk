import { keccak256, toHex, type Address, type Hash } from "viem";
import { ApiClient, type ApiClientConfig } from "./api-client.js";
import { CryptoPaymentProvider } from "./providers/crypto-provider.js";
import { SubscriptionProvider } from "./providers/subscription-provider.js";
import { defaultChainConfigs } from "./chains.js";
import type {
  WalletAdapter,
  ChainName,
  ChainConfig,
  BalanceInfo,
  Invoice,
  Plan,
  Subscription,
  SubscribeResult,
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
  private subscriptionProvider: SubscriptionProvider;
  private chains: Record<string, ChainConfig>;

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
    this.subscriptionProvider = new SubscriptionProvider(
      config.wallet,
      config.chains
    );

    // Merge chains for local use
    this.chains = { ...defaultChainConfigs };
    if (config.chains) {
      for (const [name, overrides] of Object.entries(config.chains)) {
        if (this.chains[name]) {
          this.chains[name] = { ...this.chains[name], ...overrides };
        }
      }
    }
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

  // ========================= Subscription Plans (merchant) =========================

  /** Create a subscription plan (requires apiKey). */
  async createPlan(params: {
    name: string;
    amountUsd: string;
    intervalSeconds: number;
    cycles: number;
    chain?: string;
    token?: string;
    description?: string;
  }): Promise<Plan> {
    return this.api.createPlan(params);
  }

  /** List the merchant's plans. */
  async listPlans(): Promise<Plan[]> {
    return this.api.listPlans();
  }

  /** Get a plan by ID (public — used by /subscribe/[planId] pages). */
  async getPlan(planId: string): Promise<Plan> {
    return this.api.getPlan(planId);
  }

  /** Update a plan (e.g., toggle `active`). */
  async updatePlan(
    planId: string,
    updates: Partial<{ name: string; description: string; active: boolean }>
  ): Promise<Plan> {
    return this.api.updatePlan(planId, updates);
  }

  /** Delete a plan — rejected if live subscribers exist. */
  async deletePlan(planId: string): Promise<{ deleted: boolean }> {
    return this.api.deletePlan(planId);
  }

  // ========================= Subscription (user flow) =========================

  /**
   * Full subscription flow — call from the /subscribe/[planId] page after
   * the user connects their wallet.
   *
   *   1. Fetch plan details (if not provided)
   *   2. Approve SubscriptionManager for `amount × cycles` tokens
   *   3. Call SubscriptionManager.subscribe(plan) — creates on-chain subscription + first charge
   *   4. Register the subscription with the backend (POST /v1/plans/:id/subscribe)
   *
   * Returns the persisted subscription + on-chain details.
   */
  async subscribe(params: {
    planId: string;
    /** Pre-fetched plan (optional — will fetch if omitted) */
    plan?: Plan;
    /** Override the SubscriptionManager address (defaults to chain config) */
    subscriptionManagerAddress?: Address;
    /** Expiry unix timestamp (0 = no expiry; defaults to now + interval × cycles) */
    expiry?: number;
  }): Promise<SubscribeResult> {
    const subscriberAddress = this.wallet.getAddress();
    if (!subscriberAddress) throw new Error("Wallet not connected");

    const plan = params.plan ?? (await this.api.getPlan(params.planId));
    const chain = plan.chain as ChainName;

    const subscriptionManagerAddress =
      params.subscriptionManagerAddress ??
      this.chains[chain]?.subscriptionManagerAddress;

    if (!subscriptionManagerAddress) {
      throw new Error(`SubscriptionManager not configured for ${chain}`);
    }

    // Step 1-3: on-chain approve + subscribe
    const onChain = await this.subscriptionProvider.subscribe({
      plan,
      subscriberAddress,
      subscriptionManagerAddress,
      expiry: params.expiry,
    });

    // Step 4: register with backend
    const subscription = await this.api.subscribeToPlan(plan.id, {
      subscriberAddress,
      onChainId: onChain.onChainId,
      txHash: onChain.subscribeTxHash,
    });

    return {
      subscription,
      onChainId: onChain.onChainId,
      approveTxHash: onChain.approveTxHash,
      subscribeTxHash: onChain.subscribeTxHash,
      chain,
    };
  }

  /** List the merchant's subscriptions. */
  async listSubscriptions(status?: string): Promise<Subscription[]> {
    return this.api.listSubscriptions(status);
  }

  /** Get a single subscription. */
  async getSubscription(id: string): Promise<Subscription> {
    return this.api.getSubscription(id);
  }

  /**
   * Cancel a subscription. Performs two actions:
   *   1. On-chain: calls SubscriptionManager.cancel() — stops future charges
   *   2. Backend: marks subscription as cancelled in DB
   *
   * Requires the connected wallet to be the subscriber. Use `apiOnly: true`
   * to only mark the backend record (e.g., from the merchant Dashboard).
   */
  async cancelSubscription(
    subscriptionId: string,
    opts?: { apiOnly?: boolean }
  ): Promise<{ subscription: Subscription; cancelTxHash?: Hash }> {
    const sub = await this.api.getSubscription(subscriptionId);

    let cancelTxHash: Hash | undefined;
    if (!opts?.apiOnly && sub.onChainId !== undefined && sub.onChainId !== null) {
      const chain = sub.chain as ChainName;
      const subMgrAddr = this.chains[chain]?.subscriptionManagerAddress;
      if (subMgrAddr) {
        cancelTxHash = await this.subscriptionProvider.cancel({
          chain,
          subscriptionManagerAddress: subMgrAddr,
          onChainId: sub.onChainId,
        });
      }
    }

    const cancelled = await this.api.cancelSubscription(subscriptionId);
    return { subscription: cancelled, cancelTxHash };
  }
}
