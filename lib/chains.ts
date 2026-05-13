import type { ChainConfig } from "@/types";

export const MAX_REPEAT_COUNT = 10;
export const DEFAULT_SLIPPAGE = 0.5;
export const DEFAULT_MAX_SPEND = "100";
export const SUI_MAINNET_CHAIN_ID = -784;
export const SUI_LIFI_CHAIN_ID = "9270000000000000";

export const CHAINS: ChainConfig[] = [
  {
    id: 11155111,
    name: "Ethereum Sepolia",
    shortName: "sepolia",
    nativeCurrency: "ETH",
    explorerUrl: "https://sepolia.etherscan.io",
    testnet: true,
    kind: "evm"
  },
  {
    id: 84532,
    name: "Base Sepolia",
    shortName: "base-sepolia",
    nativeCurrency: "ETH",
    explorerUrl: "https://sepolia.basescan.org",
    testnet: true,
    kind: "evm"
  },
  {
    id: 421614,
    name: "Arbitrum Sepolia",
    shortName: "arb-sepolia",
    nativeCurrency: "ETH",
    explorerUrl: "https://sepolia.arbiscan.io",
    testnet: true,
    kind: "evm"
  },
  {
    id: 1,
    name: "Ethereum Mainnet",
    shortName: "ethereum",
    nativeCurrency: "ETH",
    explorerUrl: "https://etherscan.io",
    testnet: false,
    kind: "evm"
  },
  {
    id: 8453,
    name: "Base Mainnet",
    shortName: "base",
    nativeCurrency: "ETH",
    explorerUrl: "https://basescan.org",
    testnet: false,
    kind: "evm"
  },
  {
    id: 137,
    name: "Polygon Mainnet",
    shortName: "polygon",
    nativeCurrency: "POL",
    explorerUrl: "https://polygonscan.com",
    testnet: false,
    kind: "evm"
  },
  {
    id: 42161,
    name: "Arbitrum One",
    shortName: "arbitrum",
    nativeCurrency: "ETH",
    explorerUrl: "https://arbiscan.io",
    testnet: false,
    kind: "evm"
  },
  {
    id: 10,
    name: "Optimism Mainnet",
    shortName: "optimism",
    nativeCurrency: "ETH",
    explorerUrl: "https://optimistic.etherscan.io",
    testnet: false,
    kind: "evm"
  },
  {
    id: SUI_MAINNET_CHAIN_ID,
    name: "Sui Mainnet",
    shortName: "sui",
    nativeCurrency: "SUI",
    explorerUrl: "https://suiscan.xyz/mainnet",
    testnet: false,
    kind: "sui",
    suiChain: "sui:mainnet"
  }
];

export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
export const SUI_NATIVE_TOKEN_ADDRESS = "0x2::sui::SUI";
export const LIFI_SUPPORTED_CHAIN_IDS = [1, 8453, 137, 42161, 10] as const;
export const PREFERRED_SWAP_TARGET_TOKENS: Record<number, string> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  10: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  [SUI_MAINNET_CHAIN_ID]: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
};

export function getChain(chainId: number) {
  return CHAINS.find((chain) => chain.id === chainId) ?? CHAINS[0];
}

export function isLifiSupportedChain(chainId: number) {
  return isSuiChain(chainId) || LIFI_SUPPORTED_CHAIN_IDS.some((id) => id === chainId);
}

export function isSuiChain(chainId: number) {
  return getChain(chainId).kind === "sui";
}

export function isEvmChain(chainId: number) {
  return getChain(chainId).kind === "evm";
}

export function getDefaultLifiChainId(preferredChainId?: number) {
  return preferredChainId && isLifiSupportedChain(preferredChainId) ? preferredChainId : LIFI_SUPPORTED_CHAIN_IDS[0];
}

export function getLifiSupportedChains() {
  return CHAINS.filter((chain) => isLifiSupportedChain(chain.id));
}

export function getNativeTokenAddress(chainId: number) {
  return isSuiChain(chainId) ? SUI_NATIVE_TOKEN_ADDRESS : NATIVE_TOKEN_ADDRESS;
}

export function getPreferredSwapTargetToken(chainId: number) {
  return PREFERRED_SWAP_TARGET_TOKENS[chainId] ?? getNativeTokenAddress(chainId);
}

export function getLifiChainId(chainId: number) {
  return isSuiChain(chainId) ? SUI_LIFI_CHAIN_ID : String(chainId);
}

export function toHexChainId(chainId: number) {
  return `0x${chainId.toString(16)}` as const;
}

export function explorerTxUrl(chainId: number, hash: string) {
  const chain = getChain(chainId);
  return chain.kind === "sui" ? `${chain.explorerUrl}/tx/${hash}` : `${chain.explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(chainId: number, address: string) {
  const chain = getChain(chainId);
  return chain.kind === "sui" ? `${chain.explorerUrl}/account/${address}` : `${chain.explorerUrl}/address/${address}`;
}
