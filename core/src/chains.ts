import { mainnet, arbitrum, bsc, polygon, optimism } from "viem/chains";
import type { ChainConfig, ChainName } from "./types.js";

// Default chain configs - addresses should be updated after deployment
const DEFAULT_PAYMENT_RECEIVER = "0x0000000000000000000000000000000000000000" as const;

const USDT: Record<ChainName, `0x${string}`> = {
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  bsc: "0x55d398326f99059fF775485246999027B3197955",
  polygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  optimism: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
};

const USDC: Record<ChainName, `0x${string}`> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

export const defaultChainConfigs: Record<ChainName, ChainConfig> = {
  ethereum: {
    name: "ethereum",
    viemChain: mainnet,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    paymentReceiverAddress: DEFAULT_PAYMENT_RECEIVER,
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
    paymentReceiverAddress: DEFAULT_PAYMENT_RECEIVER,
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
    paymentReceiverAddress: DEFAULT_PAYMENT_RECEIVER,
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
    paymentReceiverAddress: DEFAULT_PAYMENT_RECEIVER,
    blockExplorerUrl: "https://polygonscan.com",
    tokens: [
      { symbol: "USDT", address: USDT.polygon, decimals: 6 },
      { symbol: "USDC", address: USDC.polygon, decimals: 6 },
    ],
  },
  optimism: {
    name: "optimism",
    viemChain: optimism,
    rpcUrl: "https://mainnet.optimism.io",
    paymentReceiverAddress: DEFAULT_PAYMENT_RECEIVER,
    blockExplorerUrl: "https://optimistic.etherscan.io",
    tokens: [
      { symbol: "USDT", address: USDT.optimism, decimals: 6 },
      { symbol: "USDC", address: USDC.optimism, decimals: 6 },
    ],
  },
};
