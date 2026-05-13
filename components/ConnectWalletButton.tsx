"use client";

import { LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWaap } from "@/components/WaapProvider";
import { getChain } from "@/lib/chains";
import { shortAddress } from "@/lib/utils";

export function ConnectWalletButton() {
  const { address, suiAddress, chainId, connected, connect, refresh, initializing, error, connectStatus } = useWaap();
  const chain = chainId ? getChain(chainId) : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="font-medium">{connected ? shortAddress(address) : "Connect to start"}</span>
          {chain && <Badge variant={chain.testnet ? "success" : "warning"}>{chain.name}</Badge>}
          {suiAddress && <Badge variant="warning">Sui {shortAddress(suiAddress)}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{connectStatus}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          WaaP handles authentication and signing. This app never asks for seed phrases or private keys.
        </p>
        {error && <p className="mt-2 text-sm text-red-200">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={connect} disabled={initializing}>
          <LogIn className="h-4 w-4" />
          {connected ? "Reconnect WaaP" : "Connect WaaP"}
        </Button>
        <Button variant="outline" size="icon" onClick={refresh} title="Refresh wallet state">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
