export type Hex = `0x${string}`;

export type ActionType = "send" | "multi-send" | "swap" | "bridge" | "repeat";
export type TxStatus = "draft" | "pending" | "confirmed" | "failed" | "stopped" | "paused";

export type ChainConfig = {
  id: number;
  name: string;
  shortName: string;
  nativeCurrency: string;
  explorerUrl: string;
  testnet: boolean;
  kind: "evm" | "sui";
  suiChain?: "sui:mainnet" | "sui:testnet" | "sui:devnet" | "sui:localnet";
};

export type TokenOption = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  /** USD price per whole token, as reported by LI.FI's /tokens endpoint.
   *  Optional — not every listed token has a price. */
  priceUSD?: string;
};

export type TransactionRecord = {
  id: string;
  type: ActionType;
  chainId: number;
  chainName: string;
  token: string;
  amount: string;
  hash?: string;
  status: TxStatus;
  timestamp: number;
  explorerUrl?: string;
  description: string;
};

export type LifiQuoteRequest = {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  amount: string;
  fromTokenDecimals?: number;
  fromAddress: string;
  toAddress?: string;
  slippage: number;
};

export type LifiQuote = {
  id: string;
  tool: string;
  fromAmount: string;
  fromAmountFormatted: string;
  toAmount: string;
  toAmountFormatted: string;
  minReceived: string;
  gasCostUsd?: string;
  feeCostUsd?: string;
  estimatedTime?: number;
  approvalAddress?: string;
  /** Snapshot of what the user typed into the form at the moment this quote
   *  was fetched. Used by assertSafeEvmTxRequest to detect both stale quotes
   *  (form changed after fetch) and inflated-amount attacks (quote.fromAmount
   *  not equal to parseUnits(snapshot.amount, snapshot.decimals)). */
  userInputs?: { amount: string; decimals: number };
  /** Total native-token fees LI.FI itself declared in the estimate (bridge
   *  messaging fees, included or otherwise). Stored as a base-unit decimal
   *  string. Used as the upper bound on how much `tx.value` may legitimately
   *  exceed `fromAmount` for native-source routes. */
  estimatedNativeOverhead?: string;
  transactionRequest?: {
    to?: string;
    data?: Hex | string;
    value?: Hex | string;
    chainId?: number | string;
    txBytes?: string;
    transaction?: string;
    bytes?: string;
    [key: string]: unknown;
  };
  raw?: unknown;
};

export type WaaPProviderRequest = {
  method: string;
  params?: unknown[];
};

export type Eip1193Provider = {
  request<T = unknown>(args: WaaPProviderRequest): Promise<T>;
  login?: () => Promise<"waap" | "human" | "injected" | "walletconnect" | null>;
  logout?: () => Promise<unknown>;
  isConnected?: () => boolean;
  getLoginMethod?: () => "waap" | "human" | "injected" | "walletconnect" | null;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    waap?: Eip1193Provider;
  }
}
