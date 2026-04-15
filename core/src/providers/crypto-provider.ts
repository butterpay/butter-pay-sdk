import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
  maxUint256,
} from "viem";
import { ERC20_ABI, PAYMENT_ROUTER_ABI } from "../abi/index.js";
import { defaultChainConfigs } from "../chains.js";
import type {
  PaymentProvider,
  PayParams,
  PayResult,
  WalletAdapter,
  ChainName,
  ChainConfig,
  BalanceInfo,
} from "../types.js";

// Tokens known to support EIP-2612 permit
const PERMIT_TOKENS = new Set([
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // ETH USDC
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // ARB USDC
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon USDC
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // OP USDC
].map((a) => a.toLowerCase()));

export class CryptoPaymentProvider implements PaymentProvider {
  readonly method = "crypto" as const;

  private wallet: WalletAdapter;
  private chains: Record<string, ChainConfig>;
  private clients: Map<string, PublicClient> = new Map();

  constructor(
    wallet: WalletAdapter,
    chainOverrides?: Partial<Record<ChainName, Partial<ChainConfig>>>
  ) {
    this.wallet = wallet;
    this.chains = { ...defaultChainConfigs };
    if (chainOverrides) {
      for (const [name, overrides] of Object.entries(chainOverrides)) {
        if (this.chains[name]) {
          this.chains[name] = { ...this.chains[name], ...overrides };
        }
      }
    }
  }

  private getClient(chain: ChainName): PublicClient {
    if (!this.clients.has(chain)) {
      const cfg = this.chains[chain];
      if (!cfg) throw new Error(`Unknown chain: ${chain}`);
      const client = createPublicClient({
        chain: cfg.viemChain,
        transport: http(cfg.rpcUrl),
      });
      this.clients.set(chain, client);
    }
    return this.clients.get(chain)!;
  }

  /** Check if a token supports EIP-2612 permit */
  supportsPermit(tokenAddress: Address): boolean {
    return PERMIT_TOKENS.has(tokenAddress.toLowerCase());
  }

  /** Scan all chains for token balances */
  async scanBalances(address: Address): Promise<BalanceInfo[]> {
    const results: BalanceInfo[] = [];

    const promises = Object.values(this.chains).flatMap((chainCfg) =>
      chainCfg.tokens.map(async (token) => {
        try {
          const client = this.getClient(chainCfg.name);
          const rawBalance = (await client.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;

          if (rawBalance > 0n) {
            results.push({
              chain: chainCfg.name,
              token: token.symbol,
              balance: formatUnits(rawBalance, token.decimals),
              rawBalance,
            });
          }
        } catch {
          // Skip failed RPC
        }
      })
    );

    await Promise.allSettled(promises);
    return results.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));
  }

  /** Ensure token allowance (for tokens that don't support permit) */
  async ensureApproval(
    chain: ChainName,
    tokenAddress: Address,
    spender: Address,
    amount: bigint
  ): Promise<void> {
    const address = this.wallet.getAddress();
    if (!address) throw new Error("Wallet not connected");

    const client = this.getClient(chain);
    const allowance = (await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, spender],
    })) as bigint;

    if (allowance >= amount) return;

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
    });

    await this.wallet.sendTransaction({
      to: tokenAddress,
      data,
      chainId: this.chains[chain].viemChain.id,
    });
  }

  /**
   * Execute payment. Automatically picks the best path:
   * - Token supports permit → payWithPermit() (1 signature)
   * - Token doesn't support permit → approve + pay() (2 signatures)
   */
  async pay(params: PayParams): Promise<PayResult> {
    const address = this.wallet.getAddress();
    if (!address) throw new Error("Wallet not connected");

    const chainCfg = this.chains[params.chain];
    if (!chainCfg) throw new Error(`Unknown chain: ${params.chain}`);

    const tokenCfg = chainCfg.tokens.find((t) => t.symbol === params.token);
    if (!tokenCfg) throw new Error(`Unknown token: ${params.token}`);

    const amountWei = parseUnits(params.amount, tokenCfg.decimals);

    const paymentParams = {
      invoiceId: params.invoiceIdBytes32,
      token: tokenCfg.address,
      amount: amountWei,
      merchant: params.merchantAddress,
      referrer: params.referrer || ("0x0000000000000000000000000000000000000000" as Address),
      serviceFeeBps: params.serviceFeeBps,
      referrerFeeBps: params.referrerFeeBps || 0,
      deadline: BigInt(params.deadline),
    };

    let data: `0x${string}`;

    if (this.supportsPermit(tokenCfg.address) && this.wallet.signTypedData) {
      // Permit path: one signature (no separate approve tx needed)
      // TODO: build proper EIP-2612 permit signature via wallet.signTypedData
      // For now, fallback to approve path
      await this.ensureApproval(params.chain, tokenCfg.address, params.paymentReceiverAddress, amountWei);
      data = encodeFunctionData({
        abi: PAYMENT_ROUTER_ABI,
        functionName: "pay",
        args: [paymentParams],
      });
    } else {
      // Approve path: two signatures
      await this.ensureApproval(params.chain, tokenCfg.address, params.paymentReceiverAddress, amountWei);
      data = encodeFunctionData({
        abi: PAYMENT_ROUTER_ABI,
        functionName: "pay",
        args: [paymentParams],
      });
    }

    const txHash = await this.wallet.sendTransaction({
      to: params.paymentReceiverAddress,
      data,
      chainId: chainCfg.viemChain.id,
    });

    return { txHash, chain: params.chain, status: "submitted" };
  }

  /**
   * Execute swap-and-pay for non-stablecoin tokens.
   * Requires a quote from the backend Quote API.
   */
  async swapAndPay(params: {
    invoiceIdBytes32: `0x${string}`;
    chain: ChainName;
    inputToken: Address;
    outputToken: Address;
    inputAmount: string;
    inputDecimals: number;
    minOutputAmount: string;
    outputDecimals: number;
    merchantAddress: Address;
    paymentRouterAddress: Address;
    serviceFeeBps: number;
    referrer?: Address;
    referrerFeeBps?: number;
    deadline: number;
    dexRouter: Address;
    dexCalldata: `0x${string}`;
  }): Promise<PayResult> {
    const address = this.wallet.getAddress();
    if (!address) throw new Error("Wallet not connected");

    const chainCfg = this.chains[params.chain];
    if (!chainCfg) throw new Error(`Unknown chain: ${params.chain}`);

    const inputAmountWei = parseUnits(params.inputAmount, params.inputDecimals);
    const minOutputWei = parseUnits(params.minOutputAmount, params.outputDecimals);

    // Approve input token to PaymentRouter
    await this.ensureApproval(
      params.chain,
      params.inputToken,
      params.paymentRouterAddress,
      inputAmountWei
    );

    const data = encodeFunctionData({
      abi: PAYMENT_ROUTER_ABI,
      functionName: "swapAndPay",
      args: [
        {
          invoiceId: params.invoiceIdBytes32,
          inputToken: params.inputToken,
          outputToken: params.outputToken,
          inputAmount: inputAmountWei,
          minOutputAmount: minOutputWei,
          merchant: params.merchantAddress,
          referrer: params.referrer || ("0x0000000000000000000000000000000000000000" as Address),
          serviceFeeBps: params.serviceFeeBps,
          referrerFeeBps: params.referrerFeeBps || 0,
          deadline: BigInt(params.deadline),
          dexRouter: params.dexRouter,
          dexCalldata: params.dexCalldata,
        },
      ],
    });

    const txHash = await this.wallet.sendTransaction({
      to: params.paymentRouterAddress,
      data,
      chainId: chainCfg.viemChain.id,
    });

    return { txHash, chain: params.chain, status: "submitted" };
  }
}
