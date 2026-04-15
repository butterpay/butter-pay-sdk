import type { Invoice } from "./types.js";

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
    amount: string;
    token: string;
    chain: string;
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

  async submitTransaction(
    invoiceId: string,
    params: {
      txHash: string;
      payerAddress: string;
      toAddress: string;
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
}
