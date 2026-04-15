export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const PAYMENT_PARAMS_COMPONENTS = [
  { name: "invoiceId", type: "bytes32" },
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "merchant", type: "address" },
  { name: "referrer", type: "address" },
  { name: "serviceFeeBps", type: "uint16" },
  { name: "referrerFeeBps", type: "uint16" },
  { name: "deadline", type: "uint256" },
] as const;

const PERMIT_PARAMS_COMPONENTS = [
  { name: "value", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "v", type: "uint8" },
  { name: "r", type: "bytes32" },
  { name: "s", type: "bytes32" },
] as const;

export const PAYMENT_ROUTER_ABI = [
  {
    name: "pay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "params", type: "tuple", components: PAYMENT_PARAMS_COMPONENTS }],
    outputs: [],
  },
  {
    name: "payWithPermit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "params", type: "tuple", components: PAYMENT_PARAMS_COMPONENTS },
      { name: "permit", type: "tuple", components: PERMIT_PARAMS_COMPONENTS },
    ],
    outputs: [],
  },
  {
    name: "swapAndPay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "invoiceId", type: "bytes32" },
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "inputAmount", type: "uint256" },
          { name: "minOutputAmount", type: "uint256" },
          { name: "merchant", type: "address" },
          { name: "referrer", type: "address" },
          { name: "serviceFeeBps", type: "uint16" },
          { name: "referrerFeeBps", type: "uint16" },
          { name: "deadline", type: "uint256" },
          { name: "dexRouter", type: "address" },
          { name: "dexCalldata", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "isPaid",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Keep backward compat alias
export const PAYMENT_RECEIVER_ABI = PAYMENT_ROUTER_ABI;
