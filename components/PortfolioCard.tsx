"use client";

import { useEffect, useMemo, useState } from "react";
import { PieChart, RefreshCw } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWaap } from "@/components/WaapProvider";
import { readErc20Balance, validateAddress } from "@/lib/erc20";
import { fetchTokens } from "@/lib/lifi";
import { getChain, isSuiChain, NATIVE_TOKEN_ADDRESS } from "@/lib/chains";
import { getNativeBalance } from "@/lib/waap";
import { getSuiBalances } from "@/lib/sui";

type Holding = {
  key: string;
  symbol: string;
  amount: number;
  usd: number | null;
};

const MAX_TOKEN_SCAN = 250;
const CONCURRENCY = 8;

export function PortfolioCard() {
  const { address, suiAddress, chainId } = useWaap();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [status, setStatus] = useState("Connect WaaP to value your portfolio.");
  const [nonce, setNonce] = useState(0);
  const chain = getChain(chainId ?? 1);
  const sui = chainId ? isSuiChain(chainId) : false;
  const activeAddress = sui ? suiAddress : address;

  useEffect(() => {
    let mounted = true;
    if (!activeAddress || !chainId) return;
    setStatus(`Valuing ${chain.name} holdings…`);
    setHoldings([]);

    loadHoldings(activeAddress, chainId)
      .then((rows) => {
        if (!mounted) return;
        setHoldings(rows);
        setStatus(rows.length ? "" : "No non-zero balances found on this network.");
      })
      .catch(() => {
        if (mounted) setStatus("Unable to value the portfolio on this network.");
      });

    return () => {
      mounted = false;
    };
  }, [activeAddress, chainId, chain.name, nonce]);

  const { total, priced, sorted } = useMemo(() => {
    const withUsd = holdings.filter((h) => h.usd !== null);
    const total = withUsd.reduce((sum, h) => sum + (h.usd ?? 0), 0);
    const sorted = [...holdings].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)).slice(0, 30);
    return { total, priced: withUsd.length, sorted };
  }, [holdings]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-primary" />
            Portfolio
          </CardTitle>
          <CardDescription>
            Estimated USD value of your holdings on {chain.name}. Prices from LI.FI; unpriced tokens show amount only.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={!activeAddress} onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {activeAddress && (
          <div className="rounded-md border bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated total</div>
            <div className="text-3xl font-semibold tabular-nums">
              ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground">
              {priced} priced {priced === 1 ? "asset" : "assets"} on {chain.name}
            </div>
          </div>
        )}
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
        {sorted.length > 0 && (
          <div className="grid gap-2">
            {sorted.map((h) => (
              <div key={h.key} className="flex items-center justify-between gap-4 rounded-md border bg-background p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{h.symbol}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {h.amount.toLocaleString(undefined, { maximumFractionDigits: h.amount < 1 ? 8 : 6 })}
                  </div>
                </div>
                <div className="text-right font-medium tabular-nums">
                  {h.usd !== null ? `$${h.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Values are estimates for the current network only and may be incomplete for long-tail tokens. Not financial advice.
        </p>
      </CardContent>
    </Card>
  );
}

async function loadHoldings(address: string, chainId: number): Promise<Holding[]> {
  if (isSuiChain(chainId)) {
    // Sui: show coin amounts. LI.FI Sui pricing is limited, so USD is omitted.
    const rows = await getSuiBalances(address);
    return rows.map((r) => ({
      key: r.coinType,
      symbol: r.symbol,
      amount: Number(formatUnits(r.raw, 9)),
      usd: null
    }));
  }

  const chain = getChain(chainId);
  const tokens = await fetchTokens(chainId);
  const priceByAddress = new Map<string, number>();
  for (const t of tokens) {
    if (t.priceUSD) priceByAddress.set(t.address.toLowerCase(), Number(t.priceUSD));
  }

  const holdings: Holding[] = [];

  // Native balance + price (LI.FI lists the native token in the token list).
  const nativeRaw = BigInt(await getNativeBalance(address));
  if (nativeRaw > 0n) {
    const amount = Number(formatEther(nativeRaw));
    const nativePrice =
      priceByAddress.get(NATIVE_TOKEN_ADDRESS) ??
      priceByAddress.get("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") ??
      null;
    holdings.push({
      key: `${chainId}-native`,
      symbol: chain.nativeCurrency,
      amount,
      usd: nativePrice !== null ? amount * nativePrice : null
    });
  }

  const scannable = tokens
    .filter((t) => t.address !== NATIVE_TOKEN_ADDRESS && validateAddress(t.address))
    .slice(0, MAX_TOKEN_SCAN);

  let cursor = 0;
  async function worker() {
    while (cursor < scannable.length) {
      const token = scannable[cursor];
      cursor += 1;
      try {
        const raw = await readErc20Balance(token.address, address);
        if (raw > 0n) {
          const amount = Number(formatUnits(raw, token.decimals));
          const price = token.priceUSD ? Number(token.priceUSD) : null;
          holdings.push({
            key: `${token.chainId}-${token.address}`,
            symbol: token.symbol,
            amount,
            usd: price !== null ? amount * price : null
          });
        }
      } catch {
        // token doesn't implement balanceOf consistently — skip
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return holdings;
}
