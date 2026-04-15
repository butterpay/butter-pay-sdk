# ButterPay SDK

Official TypeScript SDKs for integrating [ButterPay](https://github.com/butterpay) — crypto payments with stablecoin settlement.

## Packages

| Package | Purpose |
|---|---|
| [`@butterpay/core`](./core) | Low-level SDK: wallet adapters, payment providers, API client |
| [`@butterpay/react`](./react) | React components (PayButton, PaymentModal, PaymentLink) built on core |

## Quick Start

### Core SDK

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
  merchantAddress: "0x...",
  paymentReceiverAddress: "0x...", // PaymentRouter address
  serviceFeeBps: 80,
  waitForConfirmation: true,
});
```

### React SDK

```bash
npm install @butterpay/react @butterpay/core
```

```tsx
import { ButterPayProvider, PayButton } from "@butterpay/react";

function App() {
  return (
    <ButterPayProvider
      config={{
        apiUrl: "https://api.butterpay.io",
        apiKey: "bp_...",
        theme: { primaryColor: "#f59e0b" },
      }}
    >
      <PayButton
        amount="9.99"
        description="Premium Plan"
        merchantOrderId="order-123"
        onSuccess={(invoiceId, txHash) => console.log("Paid!", invoiceId, txHash)}
        onError={(err) => console.error(err)}
      />
    </ButterPayProvider>
  );
}
```

## Features

- **5 EVM chains**: Ethereum, Arbitrum, BSC, Polygon (mainnet) + Arbitrum Sepolia (testnet)
- **Multi-wallet**: EIP-6963 discovery (MetaMask, OKX, Rabby, ...) + EIP-1193 fallback
- **Three payment paths**: `pay()` (approve + pay), `payWithPermit()` (EIP-2612, 1 signature), `swapAndPay()` (any-token atomic DEX swap + settlement)
- **Non-custodial**: funds go directly from user to merchant — the router contract never holds user funds
- **USD-denominated**: invoices are priced in USD, users pay the closest stablecoin available on their chain

## Architecture

```
┌─────────────────────────────────────────┐
│          @butterpay/react               │
│  PayButton / PaymentModal / Provider    │
└─────────────────┬───────────────────────┘
                  │ wraps
┌─────────────────▼───────────────────────┐
│          @butterpay/core                │
│  ButterPay                              │
│   ├── WalletAdapter (abstract)          │
│   │   ├── ExternalWalletAdapter         │
│   │   └── HDWalletAdapter (BIP39)       │
│   ├── CryptoPaymentProvider             │
│   │   ├── scanBalances()                │
│   │   ├── pay() / payWithPermit()       │
│   │   └── swapAndPay()                  │
│   └── ApiClient (fetch-based HTTP)      │
└─────────────────────────────────────────┘
                  │
                  ▼
        Backend API + Smart Contracts
```

## License

MIT
