"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  connectWaapAccounts,
  getChainId,
  getWaapErrorMessage,
  hideWaapLoginModal,
  hideWaapLoginModalIfIdle,
  initWaapOnce,
  setWaapModalAllowed,
  switchChain,
  toggleWaapLoginModal
} from "@/lib/waap";
import { connectWaapSuiAccount, switchSuiMainnet } from "@/lib/sui";
import { isSuiChain, SUI_MAINNET_CHAIN_ID } from "@/lib/chains";
import type { SuiAccount } from "@human.tech/waap-sdk";

type WaapContextValue = {
  address?: string;
  suiAddress?: string;
  suiAccount?: SuiAccount;
  chainId?: number;
  initializing: boolean;
  connectStatus: string;
  connected: boolean;
  error?: string;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  switchToChain: (chainId: number) => Promise<void>;
};

const WaapContext = createContext<WaapContextValue | null>(null);

export function WaapProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [suiAccount, setSuiAccount] = useState<SuiAccount>();
  const [chainId, setChainId] = useState<number>();
  const [initializing] = useState(false);
  const [connectStatus, setConnectStatus] = useState("Ready to connect.");
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!window.waap) return;
    const currentChain = await getChainId();
    setChainId(currentChain);
  }, []);

  const connect = useCallback(async () => {
    setError(undefined);
    setConnectStatus("Opening WaaP login...");
    try {
      await initWaapOnce();
      if (!window.waap) {
        throw new Error("WaaP provider is unavailable. Check that the SDK loaded in this browser.");
      }
      setConnectStatus("Waiting for WaaP email login...");
      const accounts = await connectWaapAccounts();
      setAddress(accounts[0]);
      await refresh();
      try {
        const nextSuiAccount = await connectWaapSuiAccount();
        setSuiAccount(nextSuiAccount);
      } catch {
        // Sui support is optional for users who only want EVM actions.
      }
      hideWaapLoginModal();
      setConnectStatus("Connected.");
    } catch (err) {
      const message = getWaapErrorMessage(err);
      setError(message);
      setConnectStatus(message);
    } finally {
      setWaapModalAllowed(false);
      hideWaapLoginModalIfIdle();
    }
  }, [refresh]);

  const switchToChain = useCallback(
    async (nextChainId: number) => {
      setError(undefined);
      try {
        if (isSuiChain(nextChainId)) {
          const nextSuiAccount = suiAccount ?? (await connectWaapSuiAccount());
          setSuiAccount(nextSuiAccount);
          await switchSuiMainnet();
          setChainId(SUI_MAINNET_CHAIN_ID);
        } else {
          await switchChain(nextChainId);
          await refresh();
        }
      } catch (err) {
        setError(getWaapErrorMessage(err));
      }
    },
    [refresh, suiAccount]
  );

  useEffect(() => {
    if (!window.waap) return;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAddress(accounts?.[0]);
      if (accounts?.[0]) {
        hideWaapLoginModal();
        setConnectStatus("Connected.");
      }
    };
    const onChainChanged = (...args: unknown[]) => {
      const next = args[0];
      if (typeof next === "string") setChainId(Number.parseInt(next, 16));
    };

    window.waap?.on?.("accountsChanged", onAccountsChanged);
    window.waap?.on?.("chainChanged", onChainChanged);

    return () => {
      window.waap?.removeListener?.("accountsChanged", onAccountsChanged);
      window.waap?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [address]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== "q") return;
      event.preventDefault();
      toggleWaapLoginModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    hideWaapLoginModalIfIdle();
    const interval = window.setInterval(hideWaapLoginModalIfIdle, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const value = useMemo(
    () => ({
      address,
      suiAddress: suiAccount?.address,
      suiAccount,
      chainId,
      initializing,
      connectStatus,
      connected: Boolean(address),
      error,
      connect,
      refresh,
      switchToChain
    }),
    [address, chainId, connect, connectStatus, error, initializing, refresh, suiAccount, switchToChain]
  );

  return <WaapContext.Provider value={value}>{children}</WaapContext.Provider>;
}

export function useWaap() {
  const context = useContext(WaapContext);
  if (!context) throw new Error("useWaap must be used inside WaaPProvider.");
  return context;
}
