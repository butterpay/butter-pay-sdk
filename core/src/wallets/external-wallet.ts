import type { Address, Hash } from "viem";
import type { WalletAdapter, TransactionRequest } from "../types.js";

/**
 * ExternalWalletAdapter wraps any EIP-1193 provider (MetaMask, WalletConnect, etc.)
 * This is a thin adapter; the actual provider is injected.
 */
export class ExternalWalletAdapter implements WalletAdapter {
  readonly type = "external" as const;

  private provider: any; // EIP-1193 provider
  private address: Address | null = null;

  constructor(provider: any) {
    this.provider = provider;
  }

  async connect(): Promise<Address> {
    const accounts = (await this.provider.request({
      method: "eth_requestAccounts",
    })) as Address[];

    if (!accounts.length) throw new Error("No accounts returned");
    this.address = accounts[0];
    return this.address;
  }

  async disconnect(): Promise<void> {
    this.address = null;
    if (this.provider.disconnect) {
      await this.provider.disconnect();
    }
  }

  getAddress(): Address | null {
    return this.address;
  }

  isConnected(): boolean {
    return this.address !== null;
  }

  async sendTransaction(tx: TransactionRequest): Promise<Hash> {
    if (!this.address) throw new Error("Not connected");

    const hash = (await this.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: this.address,
          to: tx.to,
          data: tx.data || "0x",
          value: tx.value ? `0x${tx.value.toString(16)}` : "0x0",
          ...(tx.gas ? { gas: `0x${tx.gas.toString(16)}` } : {}),
        },
      ],
    })) as Hash;

    return hash;
  }
}
