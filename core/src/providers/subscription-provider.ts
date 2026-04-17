import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeEventLog,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { ERC20_ABI, SUBSCRIPTION_MANAGER_ABI } from "../abi/index.js";
import { defaultChainConfigs } from "../chains.js";
import type {
  WalletAdapter,
  ChainName,
  ChainConfig,
  Plan,
} from "../types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * SubscriptionProvider handles on-chain subscription interactions:
 *   1. Approve total allowance (amount × cycles)
 *   2. Call SubscriptionManager.subscribe(plan) — creates subscription + first charge
 *   3. Call SubscriptionManager.cancel(id)
 *
 * Usage:
 *   const provider = new SubscriptionProvider(wallet);
 *   const { onChainId, subscribeTxHash } = await provider.subscribe({
 *     plan,
 *     subscriberAddress,
 *     subscriptionManagerAddress,
 *   });
 */
export class SubscriptionProvider {
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

  /**
   * Compute the total ERC20 allowance needed for the full subscription lifecycle.
   *   approveAmount = amountPerPeriod × totalCycles
   *
   * Example: $9.99/month × 12 cycles = 119.88 USDC allowance.
   */
  computeApproveAmount(plan: Plan): bigint {
    const chainCfg = this.chains[plan.chain as ChainName];
    if (!chainCfg) throw new Error(`Unknown chain: ${plan.chain}`);
    const tokenCfg = chainCfg.tokens.find((t) => t.symbol === plan.token);
    if (!tokenCfg) throw new Error(`Unknown token: ${plan.token}`);
    const perPeriod = parseUnits(plan.amountUsd, tokenCfg.decimals);
    return perPeriod * BigInt(plan.cycles);
  }

  /**
   * Ensure subscriber has approved the SubscriptionManager to pull up to
   * (amountPerPeriod × cycles) tokens. If current allowance is insufficient,
   * prompts an approve() tx for exactly the required amount.
   */
  async ensureSubscriptionAllowance(params: {
    plan: Plan;
    subscriberAddress: Address;
    subscriptionManagerAddress: Address;
  }): Promise<Hash | undefined> {
    const chain = params.plan.chain as ChainName;
    const chainCfg = this.chains[chain];
    if (!chainCfg) throw new Error(`Unknown chain: ${chain}`);

    const tokenCfg = chainCfg.tokens.find((t) => t.symbol === params.plan.token);
    if (!tokenCfg) throw new Error(`Unknown token: ${params.plan.token}`);

    const requiredAllowance = this.computeApproveAmount(params.plan);

    const client = this.getClient(chain);
    const currentAllowance = (await client.readContract({
      address: tokenCfg.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [params.subscriberAddress, params.subscriptionManagerAddress],
    })) as bigint;

    if (currentAllowance >= requiredAllowance) return undefined;

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [params.subscriptionManagerAddress, requiredAllowance],
    });

    const txHash = await this.wallet.sendTransaction({
      to: tokenCfg.address,
      data,
      chainId: chainCfg.viemChain.id,
    });

    return txHash;
  }

  /**
   * Subscribe to a plan on-chain. Flow:
   *   1. Check allowance; if insufficient, prompt approve(amount × cycles)
   *   2. Call SubscriptionManager.subscribe(plan) — creates subscription + first charge
   *   3. Wait for receipt + decode SubscriptionCreated event to extract onChainId
   *
   * Returns the on-chain subscription ID + tx hashes. Call
   * `ApiClient.subscribeToPlan()` after this to register the subscription
   * with the backend scheduler.
   */
  async subscribe(params: {
    plan: Plan;
    subscriberAddress: Address;
    subscriptionManagerAddress: Address;
    expiry?: number;
  }): Promise<{
    onChainId: number;
    approveTxHash?: Hash;
    subscribeTxHash: Hash;
    chain: ChainName;
  }> {
    const connected = this.wallet.getAddress();
    if (!connected) throw new Error("Wallet not connected");
    if (connected.toLowerCase() !== params.subscriberAddress.toLowerCase()) {
      throw new Error("Connected wallet does not match subscriberAddress");
    }

    const chain = params.plan.chain as ChainName;
    const chainCfg = this.chains[chain];
    if (!chainCfg) throw new Error(`Unknown chain: ${chain}`);

    if (
      params.subscriptionManagerAddress === ZERO_ADDRESS ||
      !params.subscriptionManagerAddress
    ) {
      throw new Error(
        `SubscriptionManager not deployed on ${chain}. Subscriptions unavailable.`
      );
    }

    const tokenCfg = chainCfg.tokens.find((t) => t.symbol === params.plan.token);
    if (!tokenCfg) throw new Error(`Unknown token: ${params.plan.token}`);

    const merchantAddress =
      params.plan.merchantReceivingAddresses?.[chain];
    if (!merchantAddress) {
      throw new Error(`Merchant has no receiving address on ${chain}`);
    }

    // Step 1: approve
    const approveTxHash = await this.ensureSubscriptionAllowance({
      plan: params.plan,
      subscriberAddress: params.subscriberAddress,
      subscriptionManagerAddress: params.subscriptionManagerAddress,
    });

    // Step 2: subscribe
    const amountPerPeriod = parseUnits(params.plan.amountUsd, tokenCfg.decimals);
    const expiry =
      params.expiry ??
      Math.floor(Date.now() / 1000) + params.plan.interval * params.plan.cycles;

    const planTuple = {
      merchant: merchantAddress as Address,
      token: tokenCfg.address,
      amount: amountPerPeriod,
      interval: params.plan.interval,
      expiry,
    };

    const data = encodeFunctionData({
      abi: SUBSCRIPTION_MANAGER_ABI,
      functionName: "subscribe",
      args: [planTuple],
    });

    const subscribeTxHash = await this.wallet.sendTransaction({
      to: params.subscriptionManagerAddress,
      data,
      chainId: chainCfg.viemChain.id,
    });

    // Step 3: wait for receipt + decode event
    const client = this.getClient(chain);
    const receipt = await client.waitForTransactionReceipt({
      hash: subscribeTxHash,
    });

    const managerAddrLower = params.subscriptionManagerAddress.toLowerCase();
    let onChainId: number | undefined;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== managerAddrLower) continue;
      try {
        const decoded = decodeEventLog({
          abi: SUBSCRIPTION_MANAGER_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "SubscriptionCreated") {
          onChainId = Number((decoded.args as any).subscriptionId);
          break;
        }
      } catch {
        // Not a SubscriptionCreated event, skip
      }
    }

    if (onChainId === undefined) {
      throw new Error(
        "subscribe() tx confirmed but SubscriptionCreated event not found"
      );
    }

    return { onChainId, approveTxHash, subscribeTxHash, chain };
  }

  /** Cancel an on-chain subscription. Only the subscriber can cancel. */
  async cancel(params: {
    chain: ChainName;
    subscriptionManagerAddress: Address;
    onChainId: number;
  }): Promise<Hash> {
    const chainCfg = this.chains[params.chain];
    if (!chainCfg) throw new Error(`Unknown chain: ${params.chain}`);

    const data = encodeFunctionData({
      abi: SUBSCRIPTION_MANAGER_ABI,
      functionName: "cancel",
      args: [BigInt(params.onChainId)],
    });

    return this.wallet.sendTransaction({
      to: params.subscriptionManagerAddress,
      data,
      chainId: chainCfg.viemChain.id,
    });
  }
}
