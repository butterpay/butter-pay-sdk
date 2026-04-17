import { mainnet, arbitrum, bsc, polygon } from "viem/chains";
import { defineChain } from "viem";
import type { ChainConfig, ChainName } from "./types.js";

const arbitrumSepolia = defineChain({
  id: 421614,
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rollup.arbitrum.io/rpc"] } },
  blockExplorers: { default: { name: "Arbiscan", url: "https://sepolia.arbiscan.io" } },
  testnet: true,
});

// Default PaymentRouter address — update after mainnet deployment
const DEFAULT_PAYMENT_ROUTER = "0x0000000000000000000000000000000000000000" as const;

// Arbitrum mainnet deployed address (2026-04-16)
const ARBITRUM_PAYMENT_ROUTER = "0x4b32bcd3eC4F0a14D7061e0d239eBAd84F77743f" as const;

// Testnet deployed address
const TESTNET_PAYMENT_ROUTER = "0x2bb7f9678c6FC1F2538172F5621087a9D44F9D63" as const;
const TESTNET_SUBSCRIPTION_MANAGER = "0x51Aaf344ee7b3d35e8347afbDA777e45c7441cd6" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const USDT: Record<ChainName, `0x${string}`> = {
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  bsc: "0x55d398326f99059fF775485246999027B3197955",
  polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  arbitrumSepolia: "0x536BB419E953eC88f92f6fB23b9331071BF127db",
};

const USDC: Record<ChainName, `0x${string}`> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  arbitrumSepolia: "0xb8BC61289E64db67b7AC5887406dEf512Ec36A81",
};

export const defaultChainConfigs: Record<ChainName, ChainConfig> = {
  ethereum: {
    name: "ethereum",
    viemChain: mainnet,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    paymentRouterAddress: DEFAULT_PAYMENT_ROUTER,
    subscriptionManagerAddress: ZERO_ADDRESS,
    blockExplorerUrl: "https://etherscan.io",
    tokens: [
      { symbol: "USDT", address: USDT.ethereum, decimals: 6 },
      { symbol: "USDC", address: USDC.ethereum, decimals: 6 },
    ],
  },
  arbitrum: {
    name: "arbitrum",
    viemChain: arbitrum,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    paymentRouterAddress: ARBITRUM_PAYMENT_ROUTER,
    subscriptionManagerAddress: "0xBC7a2Ea456AE255C67b98Bd9559F15Fc742C0C66",
    blockExplorerUrl: "https://arbiscan.io",
    tokens: [
      { symbol: "USDT", address: USDT.arbitrum, decimals: 6 },
      { symbol: "USDC", address: USDC.arbitrum, decimals: 6 },
    ],
  },
  bsc: {
    name: "bsc",
    viemChain: bsc,
    rpcUrl: "https://bsc-rpc.publicnode.com",
    paymentRouterAddress: DEFAULT_PAYMENT_ROUTER,
    subscriptionManagerAddress: ZERO_ADDRESS,
    blockExplorerUrl: "https://bscscan.com",
    tokens: [
      { symbol: "USDT", address: USDT.bsc, decimals: 18 },
      { symbol: "USDC", address: USDC.bsc, decimals: 18 },
    ],
  },
  polygon: {
    name: "polygon",
    viemChain: polygon,
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    paymentRouterAddress: DEFAULT_PAYMENT_ROUTER,
    subscriptionManagerAddress: ZERO_ADDRESS,
    blockExplorerUrl: "https://polygonscan.com",
    tokens: [
      { symbol: "USDT", address: USDT.polygon, decimals: 6 },
      { symbol: "USDC", address: USDC.polygon, decimals: 6 },
    ],
  },
  arbitrumSepolia: {
    name: "arbitrumSepolia",
    viemChain: arbitrumSepolia,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    paymentRouterAddress: TESTNET_PAYMENT_ROUTER,
    subscriptionManagerAddress: TESTNET_SUBSCRIPTION_MANAGER,
    blockExplorerUrl: "https://sepolia.arbiscan.io",
    tokens: [
      { symbol: "USDT", address: USDT.arbitrumSepolia, decimals: 6 },
      { symbol: "USDC", address: USDC.arbitrumSepolia, decimals: 6 },
    ],
  },
};
