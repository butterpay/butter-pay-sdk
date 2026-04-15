import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import {
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { WalletAdapter, TransactionRequest, Keystore } from "../types.js";

// BIP44 path: m/44'/60'/0'/0/index
const ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0";

export class HDWalletAdapter implements WalletAdapter {
  readonly type = "hd" as const;

  private mnemonic: string | null = null;
  private privateKey: `0x${string}` | null = null;
  private address: Address | null = null;
  private chain: Chain | null = null;
  private rpcUrl: string | null = null;

  /** Create a new HD wallet with a fresh mnemonic */
  static create(): { adapter: HDWalletAdapter; mnemonic: string } {
    const mnemonic = generateMnemonic(wordlist, 128); // 12 words
    const adapter = new HDWalletAdapter();
    adapter.loadMnemonic(mnemonic);
    return { adapter, mnemonic };
  }

  /** Import from existing mnemonic */
  static fromMnemonic(mnemonic: string): HDWalletAdapter {
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error("Invalid mnemonic");
    }
    const adapter = new HDWalletAdapter();
    adapter.loadMnemonic(mnemonic);
    return adapter;
  }

  /** Import from private key */
  static fromPrivateKey(privateKey: `0x${string}`): HDWalletAdapter {
    const adapter = new HDWalletAdapter();
    const account = privateKeyToAccount(privateKey);
    adapter.privateKey = privateKey;
    adapter.address = account.address;
    return adapter;
  }

  private loadMnemonic(mnemonic: string) {
    this.mnemonic = mnemonic;
    const seed = mnemonicToSeedSync(mnemonic);
    const hdKey = HDKey.fromMasterSeed(seed);
    const child = hdKey.derive(ETH_DERIVATION_PATH);
    if (!child.privateKey) throw new Error("Failed to derive private key");
    this.privateKey = `0x${Buffer.from(child.privateKey).toString("hex")}`;
    const account = privateKeyToAccount(this.privateKey);
    this.address = account.address;
  }

  /** Set the chain and RPC for transactions */
  setChain(chain: Chain, rpcUrl: string) {
    this.chain = chain;
    this.rpcUrl = rpcUrl;
  }

  async connect(): Promise<Address> {
    if (!this.address) throw new Error("Wallet not initialized");
    return this.address;
  }

  async disconnect(): Promise<void> {
    // In a real implementation, clear cached keys from memory
  }

  getAddress(): Address | null {
    return this.address;
  }

  isConnected(): boolean {
    return this.address !== null;
  }

  async sendTransaction(tx: TransactionRequest): Promise<Hash> {
    if (!this.privateKey || !this.chain || !this.rpcUrl) {
      throw new Error("Wallet not configured: call setChain() first");
    }

    const account = privateKeyToAccount(this.privateKey);
    const client = createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    const hash = await client.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
      gas: tx.gas,
    });

    return hash;
  }

  /** Export mnemonic (should only be used for backup display) */
  getMnemonic(): string | null {
    return this.mnemonic;
  }

  /** Encrypt mnemonic to keystore JSON */
  async encryptToKeystore(password: string): Promise<Keystore> {
    if (!this.mnemonic) throw new Error("No mnemonic to encrypt");

    // Use Web Crypto API compatible approach
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key from password using PBKDF2 (Argon2 needs external lib in browser)
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(this.mnemonic)
    );

    return {
      ciphertext: Buffer.from(ciphertext).toString("hex"),
      salt: Buffer.from(salt).toString("hex"),
      iv: Buffer.from(iv).toString("hex"),
      version: 1,
    };
  }

  /** Decrypt mnemonic from keystore */
  static async fromKeystore(
    keystore: Keystore,
    password: string
  ): Promise<HDWalletAdapter> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const salt = Buffer.from(keystore.salt, "hex");
    const iv = Buffer.from(keystore.iv, "hex");
    const ciphertext = Buffer.from(keystore.ciphertext, "hex");

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    const mnemonic = decoder.decode(plaintext);
    return HDWalletAdapter.fromMnemonic(mnemonic);
  }
}
