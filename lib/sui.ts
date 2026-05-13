import { initWaaPSui, type SuiAccount, type SuiChain, type WaaPSuiWalletInterface } from "@human.tech/waap-sdk";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { formatUnits, parseUnits } from "viem";
import { beginWaapSigningUi, finishWaapSigningUi, setWaapModalAllowed, showWaapLoginModal } from "@/lib/waap";
import type { LifiQuote } from "@/types";

let suiInitPromise: Promise<WaaPSuiWalletInterface | null> | null = null;

const SUI_CHAIN: SuiChain = "sui:mainnet";
const SUI_DECIMALS = 9;
const SUI_COIN_TYPE = "0x2::sui::SUI";

export type SuiBalanceRow = {
  coinType: string;
  symbol: string;
  name: string;
  balance: string;
  raw: bigint;
};

export function initWaapSuiOnce() {
  if (typeof window === "undefined") return Promise.resolve(null);

  if (!suiInitPromise) {
    const wallet = initWaaPSui({
      config: {
        authenticationMethods: ["email", "phone", "social"],
        allowedSocials: ["google", "twitter", "discord"],
        styles: { darkMode: true },
        showSecured: true
      },
      project: {
        name: "Mehidy's Waap Research Lab",
        entryTitle: "Log in to WaaP Action Hub"
      },
      useStaging: false
    });

    suiInitPromise = Promise.resolve(wallet);
  }

  return suiInitPromise;
}

export async function connectWaapSuiAccount() {
  const wallet = await getWaapSuiWallet();
  setWaapModalAllowed(true);
  showWaapLoginModal();
  try {
    const output = await wallet.connect();
    const account = output.accounts[0] ?? wallet.accounts[0];
    if (!account) throw new Error("WaaP Sui login completed, but no Sui account was returned.");
    return account;
  } finally {
    setWaapModalAllowed(false);
  }
}

export async function getWaapSuiWallet() {
  const wallet = await initWaapSuiOnce();
  if (!wallet) throw new Error("WaaP Sui wallet is not available in this browser session.");
  return wallet;
}

export function validateSuiAddress(value: string) {
  return isValidSuiAddress(value);
}

export async function switchSuiMainnet() {
  const wallet = await getWaapSuiWallet();
  await wallet.switchChain({ chain: SUI_CHAIN });
}

export async function sendSuiTransaction(params: {
  account: SuiAccount;
  recipient: string;
  amount: string;
}) {
  if (!validateSuiAddress(params.recipient)) throw new Error("Recipient Sui address is invalid.");

  const wallet = await getWaapSuiWallet();
  await wallet.switchChain({ chain: SUI_CHAIN });
  const client = createSuiClient();
  const mist = parseUnits(params.amount, SUI_DECIMALS);
  const tx = new Transaction();
  tx.setSender(params.account.address);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
  tx.transferObjects([coin], tx.pure.address(params.recipient));
  const transaction = await tx.build({ client });
  const { requestId, visibilityKeeper } = beginWaapSigningUi();

  try {
    const result = await wallet.signAndExecuteTransaction({
      account: params.account,
      chain: SUI_CHAIN,
      transaction,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showObjectChanges: false
      }
    });
    if (!result.digest) throw new Error("Sui transaction completed without a digest.");
    return result.digest;
  } finally {
    finishWaapSigningUi(requestId, visibilityKeeper);
  }
}

export async function executeLifiSuiQuote(params: {
  account: SuiAccount;
  quote: LifiQuote;
}) {
  const wallet = await getWaapSuiWallet();
  await wallet.switchChain({ chain: SUI_CHAIN });
  const transaction = extractSuiTransactionBytes(params.quote);
  const { requestId, visibilityKeeper } = beginWaapSigningUi();

  try {
    const result = await wallet.signAndExecuteTransaction({
      account: params.account,
      chain: SUI_CHAIN,
      transaction,
      requestType: "WaitForLocalExecution",
      options: {
        showEffects: true,
        showObjectChanges: false
      }
    });
    if (!result.digest) throw new Error("Sui route completed without a transaction digest.");
    return result.digest;
  } finally {
    finishWaapSigningUi(requestId, visibilityKeeper);
  }
}

export async function getSuiBalances(address: string): Promise<SuiBalanceRow[]> {
  const client = createSuiClient();
  const balances = await client.getAllBalances({ owner: address });
  const rows = await Promise.all(
    balances.map(async (balance) => {
      const raw = BigInt(balance.totalBalance);
      const metadata = await client.getCoinMetadata({ coinType: balance.coinType }).catch(() => null);
      const decimals = metadata?.decimals ?? (balance.coinType === SUI_COIN_TYPE ? SUI_DECIMALS : 9);
      const symbol = metadata?.symbol ?? (balance.coinType === SUI_COIN_TYPE ? "SUI" : shortCoinType(balance.coinType));
      const name = metadata?.name ?? balance.coinType;
      return {
        coinType: balance.coinType,
        symbol,
        name,
        balance: `${formatSuiAmount(raw, decimals)} ${symbol}`,
        raw
      };
    })
  );
  return rows.filter((row) => row.raw > 0n);
}

export async function waitForSuiTransaction(digest: string) {
  const client = createSuiClient();
  return client.waitForTransaction({ digest, timeout: 120_000, options: { showEffects: true } });
}

function createSuiClient() {
  return new SuiClient({ url: process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl("mainnet") });
}

function extractSuiTransactionBytes(quote: LifiQuote) {
  const tx = quote.transactionRequest;
  if (!tx) throw new Error("LI.FI did not return Sui transaction data.");
  const raw =
    tx.txBytes ??
    tx.transaction ??
    tx.bytes ??
    (typeof tx.data === "string" ? tx.data : undefined) ??
    findNestedTransactionBytes(quote.raw);

  if (!raw) {
    throw new Error("LI.FI returned a Sui route, but no executable transaction bytes were found.");
  }

  return stringToBytes(raw);
}

function findNestedTransactionBytes(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["txBytes", "transactionBytes", "transactionBlockBytes", "transaction", "bytes", "data"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const child of Object.values(record)) {
    const found = findNestedTransactionBytes(child);
    if (found) return found;
  }
  return undefined;
}

function stringToBytes(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x")) {
    const hex = trimmed.slice(2);
    if (hex.length % 2 !== 0) throw new Error("Sui transaction hex has an invalid length.");
    return Uint8Array.from(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
  }

  const binary = atob(trimmed);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function formatSuiAmount(raw: bigint, decimals: number) {
  const value = formatUnits(raw, decimals);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, { maximumFractionDigits: numeric < 1 ? 8 : 6 });
}

function shortCoinType(coinType: string) {
  return coinType.split("::").at(-1) ?? "TOKEN";
}
