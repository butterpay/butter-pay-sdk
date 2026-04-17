# ButterPay SDK

Official TypeScript SDKs for [ButterPay](https://github.com/butterpay) — non-custodial crypto payments with stablecoin settlement.

## Packages

| Package | Purpose |
|---|---|
| [`@butterpay/core`](./core) | Low-level SDK: wallet adapters, payment providers, API client |
| [`@butterpay/react`](./react) | React hooks & components (planned) |

---

## Table of Contents

- [Installation](#installation)
- [SDK Architecture](#sdk-architecture)
- [Quick Start (All-in-One)](#quick-start-all-in-one)
- [Step-by-Step Usage](#step-by-step-usage)
- [Server-Side Usage (Merchant Backend)](#server-side-usage-merchant-backend)
- [Subscriptions](#subscriptions)
- [Custom Chain Configuration](#custom-chain-configuration)
- [React Integration Example](#react-integration-example)
- [HD Wallet (Phase 2)](#hd-wallet-phase-2)
- [API Reference](#api-reference)
- [Payment Flow](#payment-flow)
- [Supported Chains](#supported-chains)
- [Features](#features)

---

## Installation

Not yet published to npm. Use one of the following:

**Option A — monorepo reference (recommended during development):**

```json
// your project's package.json
{
  "dependencies": {
    "@butterpay/core": "file:../butter-pay-sdk/core"
  }
}
```

**Option B — build and npm link:**

```bash
cd butter-pay-sdk/core
npm install
npm run build        # outputs to dist/
npm link

# in your project:
npm link @butterpay/core
```

**Peer dependency**: `viem ^2.47.10`

---

## SDK Architecture

```
┌─────────────────────────────────────────┐
│            @butterpay/core              │
│                                         │
│  ButterPay (orchestrator)               │
│   ├── WalletAdapter (abstract)          │
│   │   ├── ExternalWalletAdapter         │ — wraps window.ethereum (EIP-1193)
│   │   └── HDWalletAdapter (BIP39/44)    │ — for Phase 2 TG Mini App
│   ├── CryptoPaymentProvider             │
│   │   ├── scanBalances()                │ — multi-chain balance scan
│   │   ├── ensureApproval()              │ — ERC20 allowance mgmt
│   │   ├── pay()                         │ — stablecoin payment
│   │   └── swapAndPay()                  │ — DEX swap + payment (atomic)
│   ├── SubscriptionProvider              │
│   │   ├── computeApproveAmount()        │ — amountPerPeriod × cycles
│   │   ├── ensureSubscriptionAllowance() │ — approve exact subscription total
│   │   ├── subscribe()                   │ — on-chain subscribe + 1st charge
│   │   └── cancel()                      │ — on-chain cancel
│   └── ApiClient (fetch-based HTTP)      │
│       ├── Invoice: createInvoice / getInvoice / submitTransaction / ...
│       ├── Plan:    createPlan / listPlans / getPlan / updatePlan / deletePlan
│       └── Subscription: subscribeToPlan / listSubscriptions / ...
└─────────────────────────────────────────┘
                  │
                  ▼
   Backend API + PaymentRouter + SubscriptionManager Contracts
```

Three layers:

1. **Wallet layer** — abstracts user's wallet (external like MetaMask, or self-built HD wallet)
2. **Payment layer** — `CryptoPaymentProvider` for one-time payments; `SubscriptionProvider` for on-chain subscriptions
3. **API layer** — communicates with ButterPay backend (invoice CRUD, plan CRUD, subscription registration, tx tracking)

The `ButterPay` class orchestrates all three into a single `pay()` call.

---

## Quick Start (All-in-One)

Best for most web apps — one call handles the entire 5-step payment flow.

```ts
import { ButterPay, ExternalWalletAdapter } from "@butterpay/core";

// 1. Wrap the browser wallet
const wallet = new ExternalWalletAdapter((window as any).ethereum);

// 2. Create ButterPay instance
const butterpay = new ButterPay({
  apiUrl: "https://api.butterpay.io",
  wallet,
  // apiKey: "bp_..." // optional, only needed if calling merchant-only endpoints
});

// 3. Connect wallet
const address = await butterpay.connect();

// 4. (Optional) scan balances to help user pick a chain/token
const balances = await butterpay.scanBalances();
// → [{ chain: "arbitrum", token: "USDC", balance: "100.5" }, ...]

// 5. Execute full payment flow
const { invoice, txHash } = await butterpay.pay({
  amount: "49.99",
  token: "USDC",
  chain: "arbitrum",
  merchantAddress: "0x商户地址...",
  paymentReceiverAddress: "0xPaymentRouter地址...",
  serviceFeeBps: 80,                  // 0.8%
  description: "Premium Plan",
  merchantOrderId: "order-123",
  waitForConfirmation: true,          // poll until on-chain confirmation
});

console.log(invoice.status);  // "confirmed"
console.log(txHash);          // "0xabc..."
```

Behind the scenes, `butterpay.pay()` does:

1. `api.createInvoice()` — backend creates a USD-denominated invoice
2. Compute `keccak256(invoice.id)` as the bytes32 ID for the contract
3. `cryptoProvider.pay()` — approve (if needed) + call `PaymentRouter.pay()` / `payWithPermit()`
4. `api.submitTransaction()` — submit txHash for backend tracking
5. `api.waitForConfirmation()` — poll until invoice status is `confirmed` (if enabled)

---

## Step-by-Step Usage

For custom UIs where you want to control each step (show progress, let user retry, etc.), use the components individually.

```ts
import {
  ExternalWalletAdapter,
  CryptoPaymentProvider,
  ApiClient,
} from "@butterpay/core";

const wallet = new ExternalWalletAdapter((window as any).ethereum);
const api = new ApiClient({ baseUrl: "https://api.butterpay.io" });
const provider = new CryptoPaymentProvider(wallet);

// Step 1: Connect
const address = await wallet.connect();

// Step 2: Scan balances (display UI for user to pick)
const balances = await provider.scanBalances(address);

// Step 3: Check whether the chosen token supports EIP-2612 permit
const usdcAddr = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // ARB USDC
const supportsPermit = provider.supportsPermit(usdcAddr);

// Step 4: Ensure allowance is sufficient (prompts approve tx if not)
await provider.ensureApproval({
  chain: "arbitrum",
  token: "USDC",
  spender: "0xPaymentRouterAddress",
  amount: "50000000",                // token units (6 decimals → 50 USDC)
});

// Step 5: Create invoice
const invoice = await api.createInvoice({
  amount: "49.99",
  token: "USDC",
  chain: "arbitrum",
  description: "Order #1234",
});

// Step 6: Execute on-chain payment
const result = await provider.pay({
  invoiceId: invoice.id,
  chain: "arbitrum",
  token: "USDC",
  amount: "49.99",
  merchantAddress: "0x商户...",
  paymentReceiverAddress: "0xPaymentRouter...",
  invoiceIdBytes32: "0x...", // keccak256(invoice.id)
  serviceFeeBps: 80,
  deadline: Math.floor(Date.now() / 1000) + 1800,
});

// Step 7: Submit txHash to backend
await api.submitTransaction(invoice.id, {
  txHash: result.txHash,
  payerAddress: address,
  toAddress: "0xPaymentRouter...",
});

// Step 8: Poll for confirmation
const confirmed = await api.waitForConfirmation(invoice.id);
console.log(confirmed.status); // "confirmed"
```

---

## Server-Side Usage (Merchant Backend)

On the server, only `ApiClient` is needed — no wallet, no on-chain interaction.

```ts
import { ApiClient } from "@butterpay/core";

const api = new ApiClient({
  baseUrl: "https://api.butterpay.io",
  apiKey: process.env.BUTTERPAY_API_KEY,   // your merchant API key
});

// Create an invoice for the user
const invoice = await api.createInvoice({
  amount: "49.99",
  token: "USDC",
  chain: "arbitrum",
  description: "Order #1234",
  merchantOrderId: "order-123",
  metadata: { customerId: "cust_001" },
});

// Redirect user to the hosted payment page
const payUrl = `https://butterpay.io/pay/${invoice.id}`;

// Later, query status or rely on webhooks:
const status = await api.getInvoice(invoice.id);
```

---

## Subscriptions

ButterPay supports **non-custodial on-chain recurring payments** via the `SubscriptionManager` contract. The subscriber approves a bounded allowance (`amountPerPeriod × cycles`) once, and the backend scheduler calls `charge()` at each interval. The subscriber can cancel anytime.

### Subscription Model

| Role | What they do |
|---|---|
| **Merchant** | Creates a `Plan` (name, price, interval, cycles) via Dashboard or API |
| **User** | Visits `/subscribe/[planId]`, connects wallet, approves + subscribes on-chain |
| **Backend Scheduler** | Calls `SubscriptionManager.charge(onChainId)` every interval |
| **Contract** | Pulls tokens from user wallet → transfers to merchant (+ service fee) |

### Merchant — Create a Plan (server-side)

```ts
import { ApiClient } from "@butterpay/core";

const api = new ApiClient({
  baseUrl: "https://api.butterpay.io",
  apiKey: process.env.BUTTERPAY_API_KEY,
});

// Create a $9.99/month plan, 12 cycles total = 1 year
const plan = await api.createPlan({
  name: "Premium Monthly",
  description: "Full access to all features",
  amountUsd: "9.99",
  intervalSeconds: 30 * 24 * 60 * 60,   // 30 days
  cycles: 12,
  chain: "arbitrumSepolia",
  token: "USDT",
});

// Share this URL with users
const subscribeUrl = `https://butterpay.io/subscribe/${plan.id}`;
```

Plan management:

```ts
const myPlans = await api.listPlans();
const plan    = await api.getPlan("plan_abc");
await api.updatePlan("plan_abc", { active: false }); // stop new sign-ups
await api.deletePlan("plan_abc");                    // fails if live subscribers exist
```

### User — Subscribe to a Plan (browser)

One call handles: fetch plan → approve `amount × cycles` → `SubscriptionManager.subscribe()` → register with backend.

```ts
import { ButterPay, ExternalWalletAdapter } from "@butterpay/core";

const butterpay = new ButterPay({
  apiUrl: "https://api.butterpay.io",
  wallet: new ExternalWalletAdapter((window as any).ethereum),
});

await butterpay.connect();

const { subscription, onChainId, approveTxHash, subscribeTxHash } =
  await butterpay.subscribe({ planId: "plan_abc" });

console.log(`On-chain ID: ${onChainId}`);
console.log(`Approve tx:  ${approveTxHash}`);   // undefined if allowance was already sufficient
console.log(`Subscribe tx: ${subscribeTxHash}`);
console.log(`Status: ${subscription.status}`);  // "active"
```

### Step-by-Step (Custom UI)

For UIs that want to show progress between approve and subscribe steps:

```ts
import {
  ExternalWalletAdapter,
  ApiClient,
  SubscriptionProvider,
} from "@butterpay/core";

const wallet = new ExternalWalletAdapter((window as any).ethereum);
const api = new ApiClient({ baseUrl: "https://api.butterpay.io" });
const provider = new SubscriptionProvider(wallet);

await wallet.connect();
const subscriberAddress = wallet.getAddress()!;

// 1. Fetch plan details (public endpoint — no auth needed)
const plan = await api.getPlan("plan_abc");

// 2. Display total approval amount to user
const approveAmount = provider.computeApproveAmount(plan);
console.log(`Will approve ${approveAmount} token-units total`);
// e.g., $9.99 × 12 cycles × 10^6 (USDC decimals) = 119,880,000

// 3. On-chain approve + subscribe (emits 1-2 txs depending on existing allowance)
const subManagerAddr = "0x51Aaf344ee7b3d35e8347afbDA777e45c7441cd6"; // Arb Sepolia
const { onChainId, approveTxHash, subscribeTxHash } = await provider.subscribe({
  plan,
  subscriberAddress,
  subscriptionManagerAddress: subManagerAddr,
});

// 4. Register subscription with backend scheduler
const subscription = await api.subscribeToPlan(plan.id, {
  subscriberAddress,
  onChainId,
  txHash: subscribeTxHash,
});
```

### Cancel a Subscription

```ts
// From the user's side (browser): performs on-chain cancel + backend update
const { cancelTxHash, subscription } =
  await butterpay.cancelSubscription("sub_xyz");

// From the merchant's side (Dashboard): only updates backend record
await butterpay.cancelSubscription("sub_xyz", { apiOnly: true });
```

Note: once the subscriber's ERC20 allowance is consumed (`amount × cycles` fully charged), the contract stops pulling funds automatically — no cancellation needed at the end of a full subscription term.

### Subscription Flow Diagram

```
User                           SDK                       Contract                  Backend
 │                              │                           │                        │
 │── click "Subscribe" ────────>│                           │                        │
 │                              │── getPlan() ─────────────────────────────────────>│
 │                              │<────────────── plan data ─────────────────────────│
 │                              │                           │                        │
 │<── approve amount × cycles ──│                           │                        │
 │── sign tx ──────────────────>│── wallet.sendTransaction ─>│                        │
 │                              │                           │── approve on ERC20    │
 │                              │<── tx receipt ────────────│                        │
 │                              │                           │                        │
 │<── subscribe ────────────────│                           │                        │
 │── sign tx ──────────────────>│── SubManager.subscribe() ─>│                        │
 │                              │                           │── create subscription │
 │                              │                           │── 1st charge          │
 │                              │                           │── emit Created event  │
 │                              │<── decode onChainId ──────│                        │
 │                              │                           │                        │
 │                              │── api.subscribeToPlan() ─────────────────────────>│
 │                              │                           │          save to DB ──│
 │                              │                           │                        │
 │<── { subscription } ─────────│                           │                        │
 │                              │                           │                        │
 │            ... every interval (e.g. 30 days) ...          │                        │
 │                              │                           │                        │
 │                              │                           │<── scheduler charges ─│
 │                              │                           │── pull from wallet    │
 │                              │                           │                        │
```

### Key Safety Properties

- **Bounded allowance** — Subscriber approves exactly `amount × cycles`, never unlimited. After that amount is consumed, charges stop even if the scheduler misbehaves.
- **On-chain cancel** — `SubscriptionManager.cancel()` is callable by the subscriber at any time; no backend cooperation required.
- **Per-charge caps** — Each `charge()` pulls at most `amount` (per period); contract enforces the interval.
- **Non-custodial** — Tokens move directly from user → merchant; the contract never holds user funds.

---

## Custom Chain Configuration

Override RPC URLs, contract addresses, or token lists (useful for testnet or custom deployments):

```ts
import { ButterPay, ExternalWalletAdapter } from "@butterpay/core";

const butterpay = new ButterPay({
  apiUrl: "http://localhost:3000",
  wallet: new ExternalWalletAdapter((window as any).ethereum),
  chains: {
    arbitrum: {
      rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
      paymentReceiverAddress: "0x2bb7f9678c6FC1F2538172F5621087a9D44F9D63",
      tokens: [
        {
          symbol: "USDT",
          address: "0x536BB419E953eC88f92f6fB23b9331071BF127db",
          decimals: 6,
        },
        {
          symbol: "USDC",
          address: "0xb8BC61289E64db67b7AC5887406dEf512Ec36A81",
          decimals: 6,
        },
      ],
    },
  },
});
```

Defaults for all 5 chains live in `chains.ts` — exported as `defaultChainConfigs`.

---

## React Integration Example

```tsx
import { useState } from "react";
import {
  ButterPay,
  ExternalWalletAdapter,
  type BalanceInfo,
} from "@butterpay/core";

export function PayButton({ invoiceParams }) {
  const [bp, setBp] = useState<ButterPay | null>(null);
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "paying" | "success" | "failed"
  >("idle");

  const connect = async () => {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask");
      return;
    }
    setStatus("connecting");
    const instance = new ButterPay({
      apiUrl: "https://api.butterpay.io",
      wallet: new ExternalWalletAdapter((window as any).ethereum),
    });
    await instance.connect();
    const balances = await instance.scanBalances();
    setBp(instance);
    setBalances(balances);
    setStatus("idle");
  };

  const pay = async () => {
    if (!bp) return;
    setStatus("paying");
    try {
      await bp.pay({ ...invoiceParams, waitForConfirmation: true });
      setStatus("success");
    } catch (e) {
      console.error(e);
      setStatus("failed");
    }
  };

  return (
    <>
      {!bp && <button onClick={connect}>Connect Wallet</button>}
      {bp && status === "idle" && (
        <>
          <ul>
            {balances.map(b => (
              <li key={`${b.chain}-${b.token}`}>
                {b.chain} · {b.token}: {b.balance}
              </li>
            ))}
          </ul>
          <button onClick={pay}>Pay</button>
        </>
      )}
      {status === "paying" && <p>Processing payment...</p>}
      {status === "success" && <p>Payment confirmed!</p>}
      {status === "failed" && <p>Payment failed.</p>}
    </>
  );
}
```

---

## HD Wallet (Phase 2)

For environments where an external wallet is unavailable (e.g., Telegram Mini App WebView), use `HDWalletAdapter` to create/restore a self-custodial HD wallet inside the app.

```ts
import { HDWalletAdapter, ButterPay } from "@butterpay/core";

// Create from mnemonic
const wallet = new HDWalletAdapter({
  mnemonic: "...",         // 12/24-word BIP39 phrase
  derivationPath: "m/44'/60'/0'/0/0",
});

// Or from private key
const wallet = new HDWalletAdapter({
  privateKey: "0x...",
});

await wallet.connect();

const butterpay = new ButterPay({
  apiUrl: "https://api.butterpay.io",
  wallet,
});
```

Security recommendations:
- Encrypt mnemonic/privateKey with Argon2id + AES-256-GCM
- Store encrypted keystore in localStorage + server-side encrypted backup (TG use case)
- Sign inside a Web Worker to keep plaintext keys off the main thread

---

## API Reference

### Exported Members

| Export | Kind | Purpose |
|---|---|---|
| `ButterPay` | class | Main entry — orchestrates wallet + providers + API |
| `ButterPayConfig` | type | Constructor options for `ButterPay` |
| `ExternalWalletAdapter` | class | Wraps EIP-1193 providers (MetaMask, OKX, ...) |
| `HDWalletAdapter` | class | BIP39/BIP44 HD wallet (Phase 2) |
| `CryptoPaymentProvider` | class | Low-level one-time payment executor |
| `SubscriptionProvider` | class | Low-level on-chain subscription executor |
| `ApiClient` | class | HTTP client for ButterPay backend |
| `ApiClientConfig` | type | Options for `ApiClient` |
| `defaultChainConfigs` | const | Default 5-chain config (RPC + contracts + tokens) |
| `ERC20_ABI` / `PAYMENT_ROUTER_ABI` / `SUBSCRIPTION_MANAGER_ABI` | const | Contract ABIs |
| Types: `ChainName` / `ChainConfig` / `TokenConfig` / `WalletAdapter` / `TransactionRequest` / `PaymentProvider` / `PayParams` / `PayResult` / `Invoice` / `BalanceInfo` / `Keystore` / `HDWalletConfig` / `PaymentMethod` / `Plan` / `Subscription` / `SubscribeParams` / `SubscribeResult` | type | TypeScript types |

### `ButterPay` (class)

```ts
new ButterPay(config: ButterPayConfig)
```

**Wallet & Payments**

| Method | Returns | Description |
|---|---|---|
| `connect()` | `Promise<Address>` | Connect the wallet |
| `getAddress()` | `Address \| null` | Get connected address |
| `scanBalances()` | `Promise<BalanceInfo[]>` | Scan balances across all chains |
| `pay(params)` | `Promise<{ invoice, txHash }>` | Full one-time payment flow |
| `getInvoice(id)` | `Promise<Invoice>` | Query invoice status |
| `waitForConfirmation(id)` | `Promise<Invoice>` | Poll until confirmed |

**Subscription Plans (merchant)**

| Method | Returns | Description |
|---|---|---|
| `createPlan(params)` | `Promise<Plan>` | Create a new subscription plan (apiKey required) |
| `listPlans()` | `Promise<Plan[]>` | List the merchant's plans |
| `getPlan(planId)` | `Promise<Plan>` | Fetch a plan (public endpoint) |
| `updatePlan(id, updates)` | `Promise<Plan>` | Update plan fields |
| `deletePlan(id)` | `Promise<{ deleted }>` | Delete plan (fails if live subscribers exist) |

**Subscriptions (user flow)**

| Method | Returns | Description |
|---|---|---|
| `subscribe({ planId })` | `Promise<SubscribeResult>` | Full subscribe flow: approve + subscribe + register |
| `listSubscriptions(status?)` | `Promise<Subscription[]>` | Merchant's subscribers |
| `getSubscription(id)` | `Promise<Subscription>` | Fetch a subscription |
| `cancelSubscription(id, { apiOnly? })` | `Promise<{ subscription, cancelTxHash? }>` | Cancel (on-chain + backend) |

### `CryptoPaymentProvider` (class)

| Method | Description |
|---|---|
| `scanBalances(address)` | Parallel balance scan across 5 chains × 2 tokens |
| `supportsPermit(tokenAddress)` | Check if the token supports EIP-2612 |
| `ensureApproval({ chain, token, spender, amount })` | Check allowance; prompt approve if insufficient |
| `pay(params)` | Execute stablecoin payment (auto picks `pay` vs `payWithPermit`) |
| `swapAndPay(params)` | Atomic DEX swap + payment for non-stablecoins |

### `SubscriptionProvider` (class)

| Method | Description |
|---|---|
| `computeApproveAmount(plan)` | Returns `parseUnits(amount) × cycles` as bigint |
| `ensureSubscriptionAllowance({ plan, subscriberAddress, subscriptionManagerAddress })` | Check allowance; approve if insufficient |
| `subscribe({ plan, subscriberAddress, subscriptionManagerAddress, expiry? })` | approve → SubscriptionManager.subscribe() → decode onChainId |
| `cancel({ chain, subscriptionManagerAddress, onChainId })` | On-chain cancel |

### `ApiClient` (class)

**Invoice**

| Method | Description |
|---|---|
| `createInvoice(params)` | Create a new invoice |
| `getInvoice(id)` | Fetch invoice by ID |
| `getPaymentSession(invoiceId, payerAddress)` | Request a sessionToken before submitting tx |
| `submitTransaction(invoiceId, { sessionToken, txHash, ... })` | Submit a txHash for tracking |
| `waitForConfirmation(invoiceId, { pollInterval, timeout })` | Poll until terminal state |

**Subscription Plans**

| Method | Description |
|---|---|
| `createPlan(params)` | Create plan (apiKey required) |
| `listPlans()` | List merchant's plans |
| `getPlan(planId)` | Fetch plan (public) |
| `updatePlan(planId, updates)` | Update plan |
| `deletePlan(planId)` | Delete plan |

**Subscriptions**

| Method | Description |
|---|---|
| `subscribeToPlan(planId, { subscriberAddress, onChainId, txHash })` | Register subscription with backend (public) |
| `listSubscriptions(status?)` | List merchant's subscriptions |
| `getSubscription(id)` | Fetch subscription |
| `cancelSubscription(id)` | Mark cancelled in DB (on-chain cancel is separate) |

---

## Payment Flow

```
ButterPay.pay()
  │
  ├── 1. api.createInvoice()         → Backend creates USD-denominated invoice
  ├── 2. keccak256(invoice.id)       → Compute bytes32 ID for contract
  ├── 3. provider.pay()              → Wallet signatures:
  │        ├── approve() (if not permit)   — signature 1
  │        └── PaymentRouter.pay()         — signature 2
  │      OR:
  │        └── PaymentRouter.payWithPermit() — single signature (EIP-2612)
  ├── 4. api.submitTransaction()     → Submit txHash to backend for tracking
  └── 5. api.waitForConfirmation()   → Poll until confirmed (optional)
```

### EIP-2612 Permit

If the chosen token supports EIP-2612, `CryptoPaymentProvider.pay()` automatically uses `payWithPermit()` — collapsing approve + pay into a single wallet signature.

Supported permit tokens (built-in whitelist):
- Ethereum USDC
- Arbitrum USDC
- Polygon USDC
- Optimism USDC

---

## Supported Chains

| Chain | Chain ID | USDT Decimals | USDC Decimals | Status |
|-------|----------|--------------|--------------|--------|
| Ethereum | 1 | 6 | 6 | Mainnet |
| Arbitrum | 42161 | 6 | 6 | Mainnet |
| BSC | 56 | 18 | 18 | Mainnet |
| Polygon | 137 | 6 | 6 | Mainnet |
| Optimism | 10 | 6 | 6 | Mainnet |
| Arbitrum Sepolia | 421614 | 6 | 6 | Testnet |

---

## Features

- **Multi-chain**: 5 EVM mainnets + Arb Sepolia testnet
- **Multi-wallet**: EIP-6963 discovery (MetaMask, OKX, Rabby, ...) + EIP-1193 fallback
- **Three payment paths**: `pay()` (approve + pay), `payWithPermit()` (EIP-2612 single signature), `swapAndPay()` (any-token atomic DEX swap)
- **Non-custodial**: funds flow directly from user to merchant — PaymentRouter contract never holds user funds
- **USD-denominated**: invoices priced in USD; users pay with USDT/USDC on their preferred chain
- **Multi-chain balance scan**: parallel RPC calls to discover payable tokens across all chains
- **HD wallet support**: built-in BIP39/BIP44 for self-custody (Phase 2)
- **TypeScript first**: strict types, typed ABIs

---

## License

MIT
