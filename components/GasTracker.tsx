"use client";

import { useCallback, useEffect, useState } from "react";
import { Fuel, RefreshCw } from "lucide-react";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWaap } from "@/components/WaapProvider";
import { getChain, isSuiChain } from "@/lib/chains";

const POLL_MS = 20_000;

function tier(gwei: number): { label: string; className: string } {
  if (gwei < 1) return { label: "Very cheap", className: "text-emerald-300" };
  if (gwei < 15) return { label: "Cheap", className: "text-emerald-300" };
  if (gwei < 40) return { label: "Normal", className: "text-sky-200" };
  if (gwei < 100) return { label: "Busy", className: "text-amber-300" };
  return { label: "Expensive", className: "text-red-300" };
}

export function GasTracker() {
  const { address, chainId } = useWaap();
  const [gwei, setGwei] = useState<number | null>(null);
  const [status, setStatus] = useState<string>();
  const chain = getChain(chainId ?? 1);
  const sui = chainId ? isSuiChain(chainId) : false;

  const load = useCallback(async () => {
    if (!chainId || isSuiChain(chainId)) return;
    try {
      const res = await fetch(`/api/gas?chainId=${chainId}`, {
        cache: "no-store",
        headers: { "x-requested-with": "fetch" }
      });
      if (!res.ok) {
        setStatus("Could not read gas price for this network.");
        return;
      }
      const data = (await res.json()) as { gasPriceWei?: string };
      if (!data.gasPriceWei) {
        setStatus("Could not read gas price for this network.");
        return;
      }
      setGwei(Number(formatUnits(BigInt(data.gasPriceWei), 9)));
      setStatus(undefined);
    } catch {
      setStatus("Could not read gas price for this network.");
    }
  }, [chainId]);

  useEffect(() => {
    setGwei(null);
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const t = gwei !== null ? tier(gwei) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            Gas Tracker
          </CardTitle>
          <CardDescription>Live gas price for your currently connected network ({chain.name}).</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={!address || sui} onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {!address ? (
          <p className="text-sm text-muted-foreground">Connect WaaP to see the current gas price.</p>
        ) : sui ? (
          <p className="text-sm text-muted-foreground">
            Sui uses a fixed-style gas model rather than gwei gas price. Switch to an EVM chain to track gas.
          </p>
        ) : status ? (
          <p className="text-sm text-muted-foreground">{status}</p>
        ) : gwei === null ? (
          <p className="text-sm text-muted-foreground">Reading gas price…</p>
        ) : (
          <div className="flex items-end justify-between gap-4 rounded-md border bg-background p-4">
            <div>
              <div className="text-3xl font-semibold tabular-nums">
                {gwei.toLocaleString(undefined, { maximumFractionDigits: gwei < 1 ? 4 : 2 })}
                <span className="ml-1 text-base font-normal text-muted-foreground">gwei</span>
              </div>
              <div className="text-xs text-muted-foreground">{chain.name}</div>
            </div>
            {t && <div className={`text-sm font-semibold ${t.className}`}>{t.label}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
