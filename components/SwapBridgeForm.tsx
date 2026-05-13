"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, ArrowLeftRight, RefreshCw, Route, XCircle } from "lucide-react";
import { toHex } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChainSelector } from "@/components/ChainSelector";
import { TokenSelector } from "@/components/TokenSelector";
import { useWaap } from "@/components/WaapProvider";
import { approveErc20Spend, readErc20Allowance, validateAddress } from "@/lib/erc20";
import { fetchQuote } from "@/lib/lifi";
import {
  DEFAULT_SLIPPAGE,
  explorerTxUrl,
  getChain,
  getDefaultLifiChainId,
  getNativeTokenAddress,
  getPreferredSwapTargetToken,
  isLifiSupportedChain,
  isSuiChain
} from "@/lib/chains";
import { sendWaapTransaction, switchChain, waitForTransactionReceipt } from "@/lib/waap";
import { executeLifiSuiQuote, waitForSuiTransaction } from "@/lib/sui";
import { upsertHistory } from "@/lib/history";
import type { LifiQuote, TokenOption, TransactionRecord } from "@/types";

export function SwapBridgeForm({ defaultChainId }: { defaultChainId: number }) {
  const { address, suiAddress, suiAccount } = useWaap();
  const initialChainId = getDefaultLifiChainId(defaultChainId);
  const [fromChain, setFromChain] = useState(initialChainId);
  const [toChain, setToChain] = useState(initialChainId);
  const [fromToken, setFromToken] = useState(getNativeTokenAddress(initialChainId));
  const [toToken, setToToken] = useState(getPreferredSwapTargetToken(initialChainId));
  const [fromTokenMeta, setFromTokenMeta] = useState<TokenOption>();
  const [toTokenMeta, setToTokenMeta] = useState<TokenOption>();
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [maxSpend, setMaxSpend] = useState("100");
  const [quote, setQuote] = useState<LifiQuote>();
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<number>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledTarget, setScheduledTarget] = useState<number>();
  const scheduleTimerRef = useRef<number | undefined>(undefined);

  const mode = fromChain === toChain ? "swap" : "bridge";
  const from = getChain(fromChain);
  const to = getChain(toChain);
  const fromIsSui = isSuiChain(fromChain);
  const toIsSui = isSuiChain(toChain);
  const fromAddress = fromIsSui ? suiAddress : address;
  const toAddress = toIsSui ? suiAddress : address;
  const routeSetupIssue = getRouteSetupIssue({
    fromAddress,
    toAddress,
    fromIsSui,
    toIsSui,
    amount,
    maxSpend,
    fromChain,
    toChain,
    fromToken,
    toToken
  });

  function clearQuoteState() {
    setQuote(undefined);
    setQuoteFetchedAt(undefined);
    setConfirmed(false);
    clearScheduledExecution();
  }

  function clearScheduledExecution() {
    window.clearTimeout(scheduleTimerRef.current);
    scheduleTimerRef.current = undefined;
    setScheduledTarget(undefined);
  }

  useEffect(() => {
    return () => window.clearTimeout(scheduleTimerRef.current);
  }, []);

  async function getQuote({ keepConfirmation = false, silent = false }: { keepConfirmation?: boolean; silent?: boolean } = {}) {
    if (!silent) {
      setBusy(true);
      setStatus(undefined);
    }
    try {
      if (!fromAddress) throw new Error(fromIsSui ? "Connect WaaP Sui first by clicking Connect WaaP or Use Sui." : "Connect WaaP first.");
      if (toIsSui && !toAddress) throw new Error("Connect WaaP Sui first so LI.FI knows the Sui destination address.");
      if (!toIsSui && !toAddress) throw new Error("Connect WaaP first so LI.FI knows the destination address.");
      if (!amount || Number(amount) <= 0) throw new Error("Enter an amount.");
      if (Number(amount) > Number(maxSpend)) throw new Error("Amount exceeds the max spend protection.");
      if (fromChain === toChain && fromToken.toLowerCase() === toToken.toLowerCase()) {
        throw new Error("Choose different tokens for a same-chain swap.");
      }
      if (!isLifiSupportedChain(fromChain) || !isLifiSupportedChain(toChain)) {
        throw new Error("LI.FI routes are available only on the listed LI.FI-supported mainnets. Use Send/Receive for testnets.");
      }
      const nextQuote = await fetchQuote({
        fromChain,
        toChain,
        fromToken,
        toToken,
        amount,
        fromTokenDecimals: fromTokenMeta?.decimals ?? (fromIsSui ? 9 : 18),
        fromAddress,
        toAddress,
        slippage
      });
      setQuote(nextQuote);
      setQuoteFetchedAt(Date.now());
      if (!keepConfirmation) setConfirmed(false);
      return nextQuote;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to fetch quote.");
      throw error;
    } finally {
      if (!silent) setBusy(false);
    }
  }

  const previewRows = useMemo(
    () =>
      quote
        ? [
            ["Route", `${quote.tool} ${mode === "swap" ? "same-chain swap" : "cross-chain bridge"}`],
            ["Estimated output", `${quote.toAmountFormatted} ${toTokenMeta?.symbol ?? ""}`],
            ["Minimum received", `${quote.minReceived} ${toTokenMeta?.symbol ?? ""}`],
            ["Gas estimate", quote.gasCostUsd ? `$${quote.gasCostUsd}` : "Unavailable"],
            ["Bridge/tool fees", quote.feeCostUsd ? `$${quote.feeCostUsd}` : "Unavailable"],
            ["Estimated time", quote.estimatedTime ? `${Math.round(quote.estimatedTime / 60)} min` : "Unavailable"]
          ]
        : [],
    [mode, quote, toTokenMeta?.symbol]
  );

  async function execute(activeQuote = quote, activeQuoteFetchedAt = quoteFetchedAt) {
    setBusy(true);
    const id = crypto.randomUUID();
    try {
      if (!fromAddress) throw new Error(fromIsSui ? "Connect WaaP Sui first by clicking Connect WaaP or Use Sui." : "Connect WaaP first.");
      if (fromIsSui && !suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
      if (!activeQuote?.transactionRequest) throw new Error("Fetch a quote with executable transaction data first.");
      if (isQuoteExpired(activeQuoteFetchedAt)) {
        throw new Error("Quote is older than 90 seconds. Refresh the quote before executing.");
      }
      if (!confirmed) throw new Error("Check the confirmation box first.");
      if (Number(amount) > Number(maxSpend)) throw new Error("Amount exceeds the max spend protection.");

      const tx = activeQuote.transactionRequest;
      const pending: TransactionRecord = {
        id,
        type: mode,
        chainId: fromChain,
        chainName: from.name,
        token: fromTokenMeta?.symbol ?? fromToken,
        amount,
        status: "pending",
        timestamp: Number(new Date()),
        description: `${mode} from ${from.name} to ${to.name}`
      };
      upsertHistory(pending);

      let hash: string;
      let finalStatus: TransactionRecord["status"];
      if (fromIsSui) {
        if (!suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
        setStatus("Sending Sui route transaction to WaaP...");
        hash = await executeLifiSuiQuote({ account: suiAccount, quote: activeQuote });
        upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(fromChain, hash), status: "pending" });
        const receipt = await waitForSuiTransaction(hash);
        finalStatus = receipt.effects?.status?.status === "failure" ? "failed" : "confirmed";
      } else {
        await switchChain(fromChain);
        await ensureErc20Approval(fromAddress, activeQuote);
        if (!tx.to || !tx.data) throw new Error("LI.FI did not return executable EVM transaction data.");
        const value = normalizeTxValue(tx.value);
        setStatus("Sending EVM route transaction to WaaP...");
        hash = await sendWaapTransaction({
          from: fromAddress,
          to: tx.to,
          value,
          data: tx.data,
          chainId: typeof tx.chainId === "number" ? tx.chainId : fromChain
        });
        upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(fromChain, hash), status: "pending" });
        const receipt = await waitForTransactionReceipt(hash);
        finalStatus = receipt?.status === "0x0" ? "failed" : receipt ? "confirmed" : "pending";
      }
      setStatus(`Route transaction submitted: ${hash}`);
      upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(fromChain, hash), status: finalStatus });
      setStatus(`${mode} ${finalStatus}: ${hash}`);
    } catch (error) {
      upsertHistory({
        id,
        type: mode,
        chainId: fromChain,
        chainName: from.name,
        token: fromTokenMeta?.symbol ?? fromToken,
        amount,
        status: "failed",
        timestamp: Number(new Date()),
        description: error instanceof Error ? error.message : `${mode} failed.`
      });
      setStatus(error instanceof Error ? error.message : `${mode} failed.`);
    } finally {
      setBusy(false);
    }
  }

  function scheduleExecution() {
    try {
      if (routeSetupIssue) throw new Error(routeSetupIssue);
      if (!confirmed) throw new Error("Check the confirmation box before scheduling.");
      if (!scheduledAt) throw new Error("Choose an exact date and time first.");
      const target = new Date(scheduledAt).getTime();
      if (!Number.isFinite(target)) throw new Error("Choose a valid date and time.");
      const delay = target - Date.now();
      if (delay < 1000) throw new Error("Choose a time in the future.");
      if (delay > 2_147_483_647) throw new Error("Scheduled time is too far away for this browser timer.");

      clearScheduledExecution();
      setScheduledTarget(target);
      setStatus(`Scheduled ${mode} for ${new Date(target).toLocaleString()}. Keep this browser tab open. WaaP will still ask you to confirm.`);
      scheduleTimerRef.current = window.setTimeout(() => {
        void runScheduledExecution(target);
      }, delay);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to schedule transaction.");
    }
  }

  async function runScheduledExecution(target: number) {
    setBusy(true);
    try {
      setStatus(`Scheduled time reached (${new Date(target).toLocaleString()}). Refreshing LI.FI quote before WaaP signing...`);
      const freshQuote = await getQuote({ keepConfirmation: true, silent: true });
      setStatus("Fresh quote ready. Opening WaaP transaction request. Please confirm in WaaP.");
      await execute(freshQuote, Date.now());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Scheduled transaction failed.");
    } finally {
      clearScheduledExecution();
      setBusy(false);
    }
  }

  async function ensureErc20Approval(owner: string, activeQuote: LifiQuote) {
    if (fromToken === getNativeTokenAddress(fromChain)) return;
    if (!activeQuote.approvalAddress || !validateAddress(activeQuote.approvalAddress)) {
      throw new Error("LI.FI route requires ERC20 spending, but no valid approval address was returned.");
    }
    const required = BigInt(activeQuote.fromAmount);
    setStatus("Checking ERC20 allowance...");
    const allowance = await readErc20Allowance(fromToken, owner, activeQuote.approvalAddress);
    if (allowance >= required) return;
    setStatus("Approval required. Confirm the ERC20 approval in WaaP first.");
    const approvalHash = await approveErc20Spend({
      token: fromToken,
      owner,
      spender: activeQuote.approvalAddress,
      amount: required,
      chainId: fromChain
    });
    setStatus(`Approval submitted: ${approvalHash}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          Swap / Bridge
        </CardTitle>
        <CardDescription>Same-chain routes are swaps. Cross-chain routes are bridges.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ChainSelector
            value={fromChain}
            onChange={(value) => {
              setFromChain(value);
              setFromToken(getNativeTokenAddress(value));
              setFromTokenMeta(undefined);
              if (value === toChain) setToToken(getPreferredSwapTargetToken(value));
              clearQuoteState();
            }}
            label="From chain"
            lifiOnly
          />
          <ChainSelector
            value={toChain}
            onChange={(value) => {
              setToChain(value);
              setToToken(value === fromChain ? getPreferredSwapTargetToken(value) : getNativeTokenAddress(value));
              setToTokenMeta(undefined);
              clearQuoteState();
            }}
            label="To chain"
            lifiOnly
          />
        </div>
        <div className="rounded-md border border-sky-400/25 bg-sky-500/10 p-3 text-sm text-sky-100">
          Best route mode: LI.FI fetches quotes for EVM and Sui. EVM source routes execute with WaaP EVM signing; Sui
          source routes execute with WaaP Sui Wallet Standard transaction bytes.
        </div>
        {(!from.testnet || !to.testnet) && <RiskWarning />}
        <div className="grid gap-3 sm:grid-cols-2">
          <TokenSelector
            chainId={fromChain}
            value={fromToken}
            label="From token"
            onChange={(addressValue, token) => {
              setFromToken(addressValue);
              setFromTokenMeta(token);
              clearQuoteState();
            }}
          />
          <TokenSelector
            chainId={toChain}
            value={toToken}
            label="To token"
            onChange={(addressValue, token) => {
              setToToken(addressValue);
              setToTokenMeta(token);
              clearQuoteState();
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label className="grid gap-2">
            Amount
            <Input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                clearQuoteState();
              }}
              placeholder="0.0"
            />
          </Label>
          <Label className="grid gap-2">
            Slippage %
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={slippage}
              onChange={(event) => {
                setSlippage(Number(event.target.value));
                clearQuoteState();
              }}
            />
          </Label>
          <Label className="grid gap-2">
            Max spend per action
            <Input
              value={maxSpend}
              onChange={(event) => {
                setMaxSpend(event.target.value);
                clearQuoteState();
              }}
              placeholder="100"
            />
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void getQuote().catch(() => undefined)} disabled={busy || Boolean(routeSetupIssue)}>
            <RefreshCw className="h-4 w-4" />
            {quote ? "Refresh quote" : "Get Quote"}
          </Button>
          <Button onClick={() => void execute()} disabled={busy || !quote || !confirmed}>
            <Route className="h-4 w-4" />
            {mode === "swap" ? "Execute Swap" : "Execute Bridge"}
          </Button>
        </div>
        <div className="grid gap-3 rounded-md border bg-background p-3 text-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="font-medium">Scheduled execution</div>
              <p className="text-muted-foreground">
                Pick an exact local time. The app refreshes the quote at that time, then opens WaaP for manual confirmation.
              </p>
            </div>
            {scheduledTarget && <span className="text-xs text-sky-100">Scheduled for {new Date(scheduledTarget).toLocaleString()}</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Label className="grid gap-2">
              Execute at
              <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </Label>
            <Button type="button" className="self-end" variant="secondary" onClick={scheduleExecution} disabled={busy || Boolean(routeSetupIssue) || !confirmed}>
              <AlarmClock className="h-4 w-4" />
              Schedule
            </Button>
            <Button
              type="button"
              className="self-end"
              variant="outline"
              onClick={() => {
                clearScheduledExecution();
                setStatus("Scheduled execution cancelled.");
              }}
              disabled={!scheduledTarget}
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
          <p className="text-xs text-amber-100">
            WaaP confirmations cannot be auto-approved from this website. That protection prevents a site from signing transactions without you.
          </p>
        </div>
        {routeSetupIssue && <p className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{routeSetupIssue}</p>}
        {quote && (
          <div className="grid gap-2 rounded-md border bg-background p-3 text-sm">
            <strong>Route preview</strong>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Path selection</span>
              <span className="text-right">Best available LI.FI quote</span>
            </div>
            {quoteFetchedAt && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Quote freshness</span>
                <span className="text-right">Valid for 90s after refresh</span>
              </div>
            )}
            {previewRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right">{value}</span>
              </div>
            ))}
          </div>
        )}
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I reviewed this route, slippage, fees, and destination chain before signing.
        </label>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}

export function RiskWarning() {
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
      Repeated swaps or bridges can lose money from gas, slippage, bridge fees, MEV, and price movement. Mainnet routes are
      clearly labeled and should be tested on testnets first.
    </div>
  );
}

function normalizeTxValue(value?: string) {
  if (!value) return "0x0";
  if (value.startsWith("0x")) return value;
  return toHex(BigInt(value));
}

function isQuoteExpired(fetchedAt?: number) {
  return Boolean(fetchedAt && Date.now() - fetchedAt > 90_000);
}

function getRouteSetupIssue({
  fromAddress,
  toAddress,
  fromIsSui,
  toIsSui,
  amount,
  maxSpend,
  fromChain,
  toChain,
  fromToken,
  toToken
}: {
  fromAddress?: string;
  toAddress?: string;
  fromIsSui: boolean;
  toIsSui: boolean;
  amount: string;
  maxSpend: string;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
}) {
  if (!fromAddress) return fromIsSui ? "Connect WaaP Sui before fetching a route." : "Connect WaaP before fetching a route.";
  if (!toAddress) return toIsSui ? "Connect WaaP Sui so LI.FI knows the Sui destination address." : "Connect WaaP so LI.FI knows the destination address.";
  if (!amount || Number(amount) <= 0) return "Enter an amount before fetching a route.";
  if (Number(amount) > Number(maxSpend || 0)) return "Amount exceeds the max spend protection.";
  if (fromChain === toChain && fromToken.toLowerCase() === toToken.toLowerCase()) return "For same-chain swaps, choose two different tokens.";
  return undefined;
}
