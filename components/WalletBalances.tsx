"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readErc20Balance, validateAddress } from "@/lib/erc20";
import { fetchTokens } from "@/lib/lifi";
import { getChain, isSuiChain, NATIVE_TOKEN_ADDRESS } from "@/lib/chains";
import { getNativeBalance } from "@/lib/waap";
import { getSuiBalances } from "@/lib/sui";
import type { TokenOption } from "@/types";

type BalanceRow = {
  key: string;
  symbol: string;
  name: string;
  balance: string;
  raw: bigint;
};

const MAX_TOKEN_SCAN = 350;
const TOKEN_SCAN_CONCURRENCY = 8;

export function WalletBalances({ address, chainId }: { address?: string; chainId?: number }) {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [status, setStatus] = useState("Connect WaaP to load balances.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const chain = getChain(chainId ?? 1);

  useEffect(() => {
    let mounted = true;
    if (!address || !chainId) {
      return;
    }

    queueMicrotask(() => {
      if (!mounted) return;
      setStatus(`Loading ${chain.name} balances...`);
      setBalances([]);
    });

    loadBalances(address, chainId, (rows, message) => {
      if (!mounted) return;
      setBalances(rows);
      setStatus(message);
    })
      .then((rows) => {
        if (!mounted) return;
        setBalances(rows);
        setStatus(rows.length ? `Showing ${rows.length} non-zero balance(s).` : "No non-zero known token balances found.");
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error ? error.message : "Unable to load token balances.");
      });

    return () => {
      mounted = false;
    };
  }, [address, chain.id, chain.name, chainId, refreshNonce]);

  const visibleBalances = useMemo(() => [...balances].sort((a, b) => Number(b.raw - a.raw)).slice(0, 50), [balances]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-primary" />
            Token Balances
          </CardTitle>
          <CardDescription>
            Current network: {chain.name}. {chain.kind === "sui" ? "Loads Sui coin balances from the Sui fullnode." : "Scans the LI.FI token list and shows non-zero balances."}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={!address} onClick={() => setRefreshNonce((value) => value + 1)}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{status}</p>
        {visibleBalances.length > 0 && (
          <div className="grid gap-2">
            {visibleBalances.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 rounded-md border bg-background p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{item.symbol}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.name}</div>
                </div>
                <div className="text-right font-medium">{item.balance}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {chain.kind === "sui"
            ? "Sui balances are loaded from coin objects on Sui mainnet."
            : "This can only scan known tokens from LI.FI on the current network. Completely unknown custom tokens need an indexer or a manually supplied contract address."}
        </p>
      </CardContent>
    </Card>
  );
}

async function loadBalances(address: string, chainId: number, onProgress?: (rows: BalanceRow[], message: string) => void) {
  const chain = getChain(chainId);
  if (isSuiChain(chainId)) {
    const rows = (await getSuiBalances(address)).map((row) => ({
      key: row.coinType,
      symbol: row.symbol,
      name: row.name,
      balance: row.balance,
      raw: row.raw
    }));
    onProgress?.(rows, rows.length ? `Showing ${rows.length} Sui coin balance(s).` : "No non-zero Sui coin balances found.");
    return rows;
  }

  const native = await getNativeBalance(address);
  const rows: BalanceRow[] = [];
  const nativeRaw = BigInt(native);
  if (nativeRaw > 0n) {
    rows.push({
      key: `${chainId}-native`,
      symbol: chain.nativeCurrency,
      name: `${chain.name} native token`,
      balance: formatDisplay(formatEther(nativeRaw), chain.nativeCurrency),
      raw: nativeRaw
    });
  }
  onProgress?.(rows, rows.length ? "Native balance loaded. Scanning known tokens..." : "Scanning known tokens...");

  const tokens = (await fetchTokens(chainId))
    .filter((token) => token.address !== NATIVE_TOKEN_ADDRESS && validateAddress(token.address))
    .slice(0, MAX_TOKEN_SCAN);
  onProgress?.(rows, `Scanning up to ${tokens.length} known token(s)...`);
  const tokenRows = await scanTokenBalances(tokens, address, (found) => {
    onProgress?.([...rows, ...found], `Scanning tokens... found ${found.length} non-zero token balance(s).`);
  });
  return [...rows, ...tokenRows];
}

async function scanTokenBalances(tokens: TokenOption[], address: string, onProgress?: (rows: BalanceRow[]) => void) {
  const rows: BalanceRow[] = [];
  let cursor = 0;
  let scanned = 0;

  async function worker() {
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      cursor += 1;
      try {
        const raw = await readErc20Balance(token.address, address);
        if (raw > 0n) {
          rows.push({
            key: `${token.chainId}-${token.address}`,
            symbol: token.symbol,
            name: token.name,
            balance: formatDisplay(formatUnits(raw, token.decimals), token.symbol),
            raw
          });
          onProgress?.(rows);
        }
      } catch {
        // Some listed tokens do not implement balanceOf consistently. Skip those quietly.
      } finally {
        scanned += 1;
        if (scanned % 50 === 0) onProgress?.(rows);
      }
    }
  }

  await Promise.all(Array.from({ length: TOKEN_SCAN_CONCURRENCY }, worker));
  return rows;
}

function formatDisplay(value: string, symbol: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${symbol}`;
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: numeric < 1 ? 8 : 6 })} ${symbol}`;
}
