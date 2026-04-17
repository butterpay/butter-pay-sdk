import type { Invoice, Plan, Subscription } from "./types.js";

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        (errBody as any).error || `API error ${res.status}`
      );
    }

    return res.json() as Promise<T>;
  }

  // ========================= Invoice =========================

  async createInvoice(params: {
    amountUsd: string;
    chain?: string;
    description?: string;
    merchantOrderId?: string;
    metadata?: Record<string, unknown>;
    redirectUrl?: string;
    webhookUrl?: string;
  }): Promise<Invoice> {
    return this.request("POST", "/v1/invoices", params);
  }

  async getInvoice(id: string): Promise<Invoice> {
    return this.request("GET", `/v1/invoices/${id}`);
  }

  // ========================= Payment Session =========================

  /**
   * Get a payment session token (required before submitting tx).
   * Binds the invoice to a specific payer wallet address.
   */
  async getPaymentSession(
    invoiceId: string,
    payerAddress: string
  ): Promise<string> {
    const res = await this.request<{ sessionToken: string }>(
      "POST",
      `/v1/invoices/${invoiceId}/session`,
      { payerAddress }
    );
    return res.sessionToken;
  }

  /**
   * Submit a transaction for tracking (requires valid sessionToken).
   */
  async submitTransaction(
    invoiceId: string,
    params: {
      sessionToken: string;
      txHash: string;
      payerAddress: string;
      toAddress: string;
      chain: string;
      token: string;
    }
  ): Promise<{ txId: string; status: string }> {
    return this.request("POST", `/v1/invoices/${invoiceId}/tx`, params);
  }

  // ========================= Polling =========================

  async waitForConfirmation(
    invoiceId: string,
    opts?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<Invoice> {
    const timeout = opts?.timeoutMs ?? 300_000; // 5 min
    const interval = opts?.pollIntervalMs ?? 5_000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const invoice = await this.getInvoice(invoiceId);
      if (invoice.status === "confirmed" || invoice.status === "failed") {
        return invoice;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error("Timeout waiting for confirmation");
  }

  // ========================= Subscription Plans (merchant) =========================

  /** Create a new subscription plan (merchant API, requires apiKey). */
  async createPlan(params: {
    name: string;
    amountUsd: string;
    intervalSeconds: number;
    cycles: number;
    chain?: string;
    token?: string;
    description?: string;
  }): Promise<Plan> {
    return this.request("POST", "/v1/subscription-plans", params);
  }

  /** List all plans for the authenticated merchant. */
  async listPlans(): Promise<Plan[]> {
    const res = await this.request<{ data: Plan[]; count: number }>(
      "GET",
      "/v1/subscription-plans"
    );
    return res.data;
  }

  /** Get a single plan by ID (public endpoint — used by /subscribe/[planId] page). */
  async getPlan(planId: string): Promise<Plan> {
    return this.request("GET", `/v1/subscription-plans/${planId}`);
  }

  /** Update a plan (merchant API). Common use: toggle `active` to stop new subscribers. */
  async updatePlan(
    planId: string,
    updates: Partial<{ name: string; description: string; active: boolean }>
  ): Promise<Plan> {
    return this.request("PATCH", `/v1/subscription-plans/${planId}`, updates);
  }

  /** Delete a plan. Rejected if live subscribers exist — use `updatePlan({active:false})` instead. */
  async deletePlan(planId: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/v1/subscription-plans/${planId}`);
  }

  // ========================= Subscriptions =========================

  /**
   * Register a subscription after the user signed the on-chain subscribe() tx.
   * Public endpoint — called by the /subscribe/[planId] page.
   */
  async subscribeToPlan(
    planId: string,
    params: {
      subscriberAddress: string;
      onChainId: number;
      txHash?: string;
    }
  ): Promise<Subscription> {
    return this.request("POST", `/v1/plans/${planId}/subscribe`, {
      planId,
      ...params,
    });
  }

  /** List all subscriptions for the authenticated merchant. */
  async listSubscriptions(status?: string): Promise<Subscription[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await this.request<{ data: Subscription[]; count: number }>(
      "GET",
      `/v1/subscriptions${query}`
    );
    return res.data;
  }

  /** Get a single subscription by ID. */
  async getSubscription(id: string): Promise<Subscription> {
    return this.request("GET", `/v1/subscriptions/${id}`);
  }

  /** Cancel a subscription (merchant side — on-chain cancel is separate). */
  async cancelSubscription(id: string): Promise<Subscription> {
    return this.request("POST", `/v1/subscriptions/${id}/cancel`);
  }
}
