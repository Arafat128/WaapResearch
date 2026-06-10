"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Network } from "lucide-react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WaapProvider, useWaap } from "@/components/WaapProvider";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { ChainSelector } from "@/components/ChainSelector";
import { ReceiveCard } from "@/components/ReceiveCard";
import { SendForm } from "@/components/SendForm";
import { MultiSendForm } from "@/components/MultiSendForm";
import { SwapBridgeForm } from "@/components/SwapBridgeForm";
import { RepeatActionGate } from "@/components/RepeatActionGate";
import { TransactionHistory } from "@/components/TransactionHistory";
import { PortfolioCard } from "@/components/PortfolioCard";
import { GasTracker } from "@/components/GasTracker";
import { AddressBook } from "@/components/AddressBook";
import { MissionGuardrails } from "@/components/MissionGuardrails";
import { LoginCounter } from "@/components/LoginCounter";
import { CHAINS, explorerAddressUrl, getChain, isSuiChain, SUI_MAINNET_CHAIN_ID } from "@/lib/chains";
import { getNativeBalance } from "@/lib/waap";
import { getSuiBalances } from "@/lib/sui";
import { shortAddress } from "@/lib/utils";

export default function Home() {
  return (
    <WaapProvider>
      <LoginCounter />
      <Dashboard />
    </WaapProvider>
  );
}

function Dashboard() {
  const { address, suiAddress, chainId, switchToChain } = useWaap();
  const [selectedChain, setSelectedChain] = useState(CHAINS[0].id);
  const [nativeBalance, setNativeBalance] = useState<string>("Not loaded");
  const displayChainId = chainId ?? selectedChain;
  const currentChain = getChain(displayChainId);
  const activeAddress = isSuiChain(displayChainId) ? suiAddress : address;

  // Keep the "Switch chain target" selector in sync with the wallet's current
  // chain. Without this it stays pinned to CHAINS[0] (Sepolia) even after the
  // wallet reports a different network, which is confusing UX.
  useEffect(() => {
    if (chainId && chainId !== selectedChain) {
      setSelectedChain(chainId);
    }
    // selectedChain intentionally excluded — we only react to wallet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  useEffect(() => {
    let mounted = true;
    if (!activeAddress || !displayChainId) {
      return;
    }

    const loadBalance = isSuiChain(displayChainId)
      ? getSuiBalances(activeAddress).then((rows) => rows.find((row) => row.symbol === "SUI")?.balance ?? "0 SUI")
      : getNativeBalance(activeAddress).then((balance) =>
          `${Number(formatEther(BigInt(balance))).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${currentChain.nativeCurrency}`
        );

    loadBalance
      .then((balance) => {
        if (!mounted) return;
        setNativeBalance(balance);
      })
      .catch(() => {
        if (mounted) setNativeBalance("Unable to load");
      });

    return () => {
      mounted = false;
    };
  }, [activeAddress, displayChainId, currentChain.nativeCurrency]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-6 pt-16 sm:px-6 sm:py-6 lg:px-8">
      <header className="grid gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="success">Testnet-first</Badge>
            <Badge variant="warning">Mainnet clearly labeled</Badge>
            <Badge variant="muted">No seed phrases</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">Waap Tools</h1>
          <p className="mx-auto max-w-3xl text-sm text-muted-foreground sm:text-base">
            Connect with WaaP, preview every action, and run controlled token workflows with clear risk checks.
          </p>
        </div>
        <ConnectWalletButton />
        <MissionGuardrails />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Dashboard
          </CardTitle>
          <CardDescription>Wallet status, chain switching, and basic address actions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="grid gap-3 rounded-md border bg-background p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Connected wallet</span>
              <span className="break-all font-medium">{activeAddress ?? "Not connected"}</span>
            </div>
            {address && (
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">EVM address</span>
                <span className="break-all">{address}</span>
              </div>
            )}
            {suiAddress && (
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">Sui address</span>
                <span className="break-all">{suiAddress}</span>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Current chain</span>
              <span>{currentChain.name}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Native balance</span>
              <span>{activeAddress ? nativeBalance : "Not connected"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!activeAddress} onClick={() => activeAddress && navigator.clipboard.writeText(activeAddress)}>
                <Copy className="h-4 w-4" />
                Copy address
              </Button>
              <Button variant="outline" disabled={!activeAddress} asChild>
                <a href={activeAddress ? explorerAddressUrl(currentChain.id, activeAddress) : "#"} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open explorer {shortAddress(activeAddress)}
                </a>
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <ChainSelector value={selectedChain} onChange={setSelectedChain} label="Switch chain target" />
            <Button onClick={() => switchToChain(selectedChain)} disabled={!address && selectedChain !== SUI_MAINNET_CHAIN_ID}>
              {selectedChain === SUI_MAINNET_CHAIN_ID ? "Use Sui" : "Switch chain"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="dashboard-grid">
        <PortfolioCard />
        <GasTracker />
      </section>

      <section className="dashboard-grid">
        <ReceiveCard chainId={selectedChain} onChainChange={setSelectedChain} />
        <SendForm defaultChainId={selectedChain} />
      </section>

      <AddressBook />

      <MultiSendForm defaultChainId={selectedChain} />

      <SwapBridgeForm defaultChainId={selectedChain} />

      <RepeatActionGate defaultChainId={selectedChain} />
      <TransactionHistory />
    </main>
  );
}
