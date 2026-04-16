# ButterPay SDK

Official TypeScript SDKs for integrating [ButterPay](https://github.com/butterpay) — crypto payments with stablecoin settlement.

## Packages

| Package | Purpose |
|---|---|
| [`@butterpay/core`](./core) | Low-level SDK: wallet adapters, payment providers, API client |

## Quick Start

```bash
npm install @butterpay/core
```

```ts
import { ButterPay, ExternalWalletAdapter } from "@butterpay/core";

const wallet = new ExternalWalletAdapter((window as any).ethereum);
await wallet.connect();

const butterpay = new ButterPay({
  apiUrl: "https://api.butterpay.io",
  apiKey: "bp_...", // merchant API key
  wallet,
});

const { invoice, txHash } = await butterpay.pay({
  amount: "9.99",
  token: "USDT",
  chain: "arbitrum",
  merchantAddress: "0x...",          // merchant receiving address
  paymentRouterAddress: "0x...",     // PaymentRouter contract address
  serviceFeeBps: 80,                 // 0.8%
  waitForConfirmation: true,
});
```

### Step-by-Step (Advanced)

For more control over the payment flow, use the individual components directly:

```ts
import { ApiClient, CryptoPaymentProvider, ExternalWalletAdapter } from "@butterpay/core";

const wallet = new ExternalWalletAdapter((window as any).ethereum);
const api = new ApiClient({ baseUrl: "https://api.butterpay.io", apiKey: "bp_..." });
const provider = new CryptoPaymentProvider(wallet);

// 1. Connect wallet
const address = await wallet.connect();

// 2. Create invoice
const invoice = await api.createInvoice({ amountUsd: "9.99", chain: "arbitrum" });

// 3. Get payment session (anti-forgery)
const sessionToken = await api.getPaymentSession(invoice.id, address);

// 4. Scan balances
const balances = await provider.scanBalances(address);

// 5. Execute on-chain payment (approve + pay)
const result = await provider.pay({ ... });

// 6. Submit tx for tracking
await api.submitTransaction(invoice.id, {
  sessionToken,
  txHash: result.txHash,
  payerAddress: address,
  toAddress: routerAddress,
  chain: "arbitrum",
  token: "USDT",
});

// 7. Wait for confirmation
const confirmed = await api.waitForConfirmation(invoice.id);
```

## Features

- **4 EVM chains**: Ethereum, Arbitrum, BSC, Polygon (mainnet) + Arbitrum Sepolia (testnet)
- **Multi-wallet**: EIP-6963 discovery (MetaMask, OKX, Rabby, ...) + EIP-1193 fallback
- **Three payment paths**: `pay()` (approve + pay), `payWithPermit()` (EIP-2612, 1 signature), `swapAndPay()` (any-token atomic DEX swap)
- **Non-custodial**: funds go directly from user to merchant — the PaymentRouter contract never holds user funds
- **USD-denominated**: invoices priced in USD, users pay with USDT/USDC on their preferred chain
- **sessionToken**: anti-forgery protection — payer wallet is bound to invoice before tx submission
- **Amount verification**: backend verifies on-chain payment amount matches invoice amount

## Architecture

```
┌─────────────────────────────────────────┐
│          @butterpay/core                │
│  ButterPay (orchestrator)               │
│   ├── WalletAdapter (abstract)          │
│   │   ├── ExternalWalletAdapter         │
│   │   └── HDWalletAdapter (BIP39)       │
│   ├── CryptoPaymentProvider             │
│   │   ├── scanBalances()                │
│   │   ├── ensureApproval()              │
│   │   ├── pay()                         │
│   │   └── swapAndPay()                  │
│   └── ApiClient (fetch-based HTTP)      │
│       ├── createInvoice()               │
│       ├── getPaymentSession()           │
│       ├── submitTransaction()           │
│       └── waitForConfirmation()         │
└─────────────────────────────────────────┘
                  │
                  ▼
        Backend API + PaymentRouter Contract
```

## Payment Flow

```
ButterPay.pay()
  │
  ├── 1. createInvoice()        → Backend creates USD-denominated invoice
  ├── 2. getPaymentSession()    → Backend issues sessionToken (JWT 30min)
  ├── 3. ensureApproval()       → ERC20 approve if needed (wallet signature 1)
  ├── 4. PaymentRouter.pay()    → On-chain payment (wallet signature 2)
  ├── 5. submitTransaction()    → Submit txHash + sessionToken to backend
  └── 6. waitForConfirmation()  → Poll until confirmed (optional)
```

## Supported Chains

| Chain | USDT Decimals | USDC Decimals | Status |
|-------|--------------|--------------|--------|
| Ethereum | 6 | 6 | Mainnet |
| Arbitrum | 6 | 6 | Mainnet |
| BSC | 18 | 18 | Mainnet |
| Polygon | 6 | 6 | Mainnet |
| Arbitrum Sepolia | 6 | 6 | Testnet |

## License

MIT
