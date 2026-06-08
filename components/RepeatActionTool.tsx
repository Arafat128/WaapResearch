"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChainSelector } from "@/components/ChainSelector";
import { TokenSelector } from "@/components/TokenSelector";
import { RiskWarning } from "@/components/SwapBridgeForm";
import { useWaap } from "@/components/WaapProvider";
import { approveErc20Spend, readErc20Allowance, validateAddress } from "@/lib/erc20";
import { assertSafeApproval, assertSafeEvmTxRequest, fetchQuote } from "@/lib/lifi";
import {
  DEFAULT_SLIPPAGE,
  explorerTxUrl,
  getChain,
  getDefaultLifiChainId,
  getNativeTokenAddress,
  getPreferredSwapTargetToken,
  isLifiSupportedChain,
  isSuiChain,
  MAX_REPEAT_COUNT,
  NATIVE_TOKEN_ADDRESS
} from "@/lib/chains";
import { clearBatchLogs, getBatchLogs, saveBatchLogs, upsertHistory } from "@/lib/history";
import { sleep } from "@/lib/utils";
import { sendWaapTransaction, switchChain, waitForTransactionReceipt } from "@/lib/waap";
import { executeLifiSuiQuote, waitForSuiTransaction } from "@/lib/sui";
import type { BatchLog } from "@/lib/history";
import type { LifiQuote, TokenOption, TransactionRecord } from "@/types";
import { toHex } from "viem";

export function RepeatActionTool({ defaultChainId }: { defaultChainId: number }) {
  const { address, suiAddress, suiAccount } = useWaap();
  const initialChainId = getDefaultLifiChainId(defaultChainId);
  const [fromChain, setFromChain] = useState(initialChainId);
  const [toChain, setToChain] = useState(initialChainId);
  const [fromToken, setFromToken] = useState(getNativeTokenAddress(initialChainId));
  const [toToken, setToToken] = useState(getPreferredSwapTargetToken(initialChainId));
  const [fromTokenMeta, setFromTokenMeta] = useState<TokenOption>();
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);
  const [repeatCount, setRepeatCount] = useState(2);
  const [delaySeconds, setDelaySeconds] = useState(8);
  const [maxSpendCap, setMaxSpendCap] = useState("100");
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [freshQuote, setFreshQuote] = useState(true);
  const [quote, setQuote] = useState<LifiQuote>();
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const logsSnapshot = useSyncExternalStore(subscribeToBatchLogs, getBatchLogSnapshot, () => "[]");
  const stopRef = useRef(false);
  const pauseRef = useRef(false);

  const mode = fromChain === toChain ? "swap" : "bridge";
  const fromIsSui = isSuiChain(fromChain);
  const toIsSui = isSuiChain(toChain);
  const fromAddress = fromIsSui ? suiAddress : address;
  const toAddress = toIsSui ? suiAddress : address;
  const cappedRepeatCount = Math.min(Math.max(1, repeatCount || 1), MAX_REPEAT_COUNT);
  const estimatedInput = Number(amount || 0) * cappedRepeatCount;
  const overSpendCap = estimatedInput > Number(maxSpendCap || 0);
  const routeSetupIssue = getRepeatSetupIssue({
    fromAddress,
    toAddress,
    fromIsSui,
    toIsSui,
    amount,
    maxSpendCap,
    estimatedInput,
    fromChain,
    toChain,
    fromToken,
    toToken
  });

  const logs = useMemo(() => JSON.parse(logsSnapshot) as BatchLog[], [logsSnapshot]);

  const preview = useMemo(
    () => ({
      repeats: cappedRepeatCount,
      totalInput: estimatedInput.toLocaleString(undefined, { maximumFractionDigits: 8 }),
      fees: quote?.gasCostUsd ? `$${(Number(quote.gasCostUsd) * cappedRepeatCount).toFixed(2)} gas estimate` : "Unavailable",
      minReceived: quote ? `${(Number(quote.minReceived) * cappedRepeatCount).toLocaleString()}` : "Fetch quote first"
    }),
    [cappedRepeatCount, estimatedInput, quote]
  );

  function addLog(message: string, status: BatchLog["status"] = "info") {
    const next = [{ id: crypto.randomUUID(), timestamp: Date.now(), message, status }, ...getBatchLogs()].slice(0, 80);
    saveBatchLogs(next);
  }

  async function getQuote() {
    try {
      if (!fromAddress) throw new Error(fromIsSui ? "Connect WaaP Sui first by clicking Connect WaaP or Use Sui." : "Connect WaaP first.");
      if (toIsSui && !toAddress) throw new Error("Connect WaaP Sui first so LI.FI knows the Sui destination address.");
      if (!toIsSui && !toAddress) throw new Error("Connect WaaP first so LI.FI knows the destination address.");
      if (!amount || Number(amount) <= 0) throw new Error("Enter an amount.");
      if (fromChain === toChain && fromToken.toLowerCase() === toToken.toLowerCase()) {
        throw new Error("Choose different tokens for a same-chain repeat swap.");
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
      setConfirmed(false);
      addLog(`Quote ready for ${mode}: minimum received ${nextQuote.minReceived}.`, "success");
      return nextQuote;
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Unable to fetch quote.", "error");
      throw error;
    }
  }

  async function startBatch() {
    setRunning(true);
    setPaused(false);
    stopRef.current = false;
    pauseRef.current = false;
    try {
      if (!fromAddress) throw new Error(fromIsSui ? "Connect WaaP Sui first by clicking Connect WaaP or Use Sui." : "Connect WaaP first.");
      if (fromIsSui && !suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
      if (!confirmed) throw new Error("Review the batch preview and check the confirmation box first.");
      if (overSpendCap) throw new Error("Estimated total input exceeds the max total spend cap.");
      if (cappedRepeatCount > MAX_REPEAT_COUNT) throw new Error(`Repeat count is capped at ${MAX_REPEAT_COUNT}.`);
      let activeQuote = quote ?? (await getQuote());
      if (!fromIsSui) await switchChain(fromChain);
      const canUseBatchApproval = !fromIsSui && !freshQuote && fromToken !== getNativeTokenAddress(fromChain);
      if (canUseBatchApproval) {
        await ensureErc20Approval(fromAddress, activeQuote, "batch", BigInt(activeQuote.fromAmount) * BigInt(cappedRepeatCount));
      }
      addLog(`Starting ${cappedRepeatCount} sequential ${mode} action(s).`, "warning");

      for (let index = 1; index <= cappedRepeatCount; index += 1) {
        if (stopRef.current) {
          addLog("Batch stopped by user.", "warning");
          break;
        }
        while (pauseRef.current && !stopRef.current) {
          await sleep(500);
        }
        if (freshQuote || !activeQuote) activeQuote = await getQuote();
        if (!activeQuote.transactionRequest) throw new Error("LI.FI did not return executable transaction data.");
        if (!fromIsSui && !canUseBatchApproval) await ensureErc20Approval(fromAddress, activeQuote, index);

        const id = crypto.randomUUID();
        const chain = getChain(fromChain);
        const pending: TransactionRecord = {
          id,
          type: "repeat",
          chainId: fromChain,
          chainName: chain.name,
          token: fromTokenMeta?.symbol ?? fromToken,
          amount,
          status: "pending",
          timestamp: Number(new Date()),
          description: `Repeat ${index}/${cappedRepeatCount}: ${mode}`
        };
        upsertHistory(pending);
        addLog(`Repeat ${index}: sending ${amount} on ${chain.name}.`, "info");
        try {
          const tx = activeQuote.transactionRequest;
          addLog(`Repeat ${index}: waiting for WaaP confirmation popup.`, "warning");
          let hash: string;
          let finalStatus: TransactionRecord["status"];
          if (fromIsSui) {
            if (!suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
            hash = await executeLifiSuiQuote({ account: suiAccount, quote: activeQuote });
            const receipt = await waitForSuiTransaction(hash);
            finalStatus = receipt.effects?.status?.status === "failure" ? "failed" : "confirmed";
          } else {
            if (!tx.to || !tx.data) throw new Error("LI.FI did not return executable EVM transaction data.");
            // H3 + M1: refuse to sign if LI.FI's tx.to / tx.value / fromAmount
            // do not match the previewed quote and the snapshot taken at fetch.
            assertSafeEvmTxRequest(activeQuote, {
              fromTokenAddress: fromToken,
              nativeTokenAddress: getNativeTokenAddress(fromChain),
              chainId: fromChain,
              userAmount: amount
            });
            hash = await sendWaapTransaction({
              from: fromAddress,
              to: tx.to,
              data: tx.data,
              value: normalizeTxValue(tx.value),
              chainId: typeof tx.chainId === "number" ? tx.chainId : fromChain
            });
            const receipt = await waitForTransactionReceipt(hash);
            finalStatus = receipt?.status === "0x0" ? "failed" : receipt ? "confirmed" : "pending";
          }
          upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(fromChain, hash), status: "pending" });
          addLog(`Repeat ${index}: submitted ${hash}. Waiting for on-chain confirmation.`, "success");
          upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(fromChain, hash), status: finalStatus });
          addLog(`Repeat ${index}: ${finalStatus} ${hash}.`, finalStatus === "failed" ? "error" : "success");
          if (finalStatus === "failed" && stopOnFailure) break;
        } catch (error) {
          upsertHistory({ ...pending, status: "failed", description: error instanceof Error ? error.message : "Repeat failed." });
          addLog(`Repeat ${index}: ${error instanceof Error ? error.message : "failed"}`, "error");
          if (stopOnFailure) break;
        }
        if (index < cappedRepeatCount) await sleep(Math.max(0, delaySeconds) * 1000);
      }
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Batch failed.", "error");
    } finally {
      setRunning(false);
      setPaused(false);
      pauseRef.current = false;
    }
  }

  async function ensureErc20Approval(owner: string, activeQuote: LifiQuote, label: number | "batch", requiredOverride?: bigint) {
    if (fromToken === NATIVE_TOKEN_ADDRESS || fromToken === getNativeTokenAddress(fromChain)) return;
    if (!activeQuote.approvalAddress || !validateAddress(activeQuote.approvalAddress)) {
      throw new Error("LI.FI route requires ERC20 spending, but no valid approval address was returned.");
    }
    // R1: refuse to approve any spender that's not a known LI.FI router.
    assertSafeApproval(fromChain, activeQuote.approvalAddress);
    const required = requiredOverride ?? BigInt(activeQuote.fromAmount);
    const prefix = label === "batch" ? "Batch" : `Repeat ${label}`;
    addLog(`${prefix}: checking ERC20 allowance.`, "info");
    const allowance = await readErc20Allowance(fromToken, owner, activeQuote.approvalAddress);
    if (allowance >= required) return;
    addLog(`${prefix}: approval required. Confirm the ERC20 approval in WaaP.`, "warning");
    const approvalHash = await approveErc20Spend({
      token: fromToken,
      owner,
      spender: activeQuote.approvalAddress,
      amount: required,
      chainId: fromChain
    });
    addLog(`${prefix}: approval submitted ${approvalHash}.`, "success");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repeat Swap / Bridge Tool</CardTitle>
        <CardDescription>Repeat a selected route a limited number of times, one transaction at a time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RiskWarning />
        <div className="rounded-md border border-sky-400/25 bg-sky-500/10 p-3 text-sm text-sky-100">
          Repeat batches use LI.FI route quotes. EVM source routes use WaaP EVM signing; Sui source routes use WaaP Sui
          Wallet Standard transaction bytes. Keep repeat counts low and test tiny amounts first.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChainSelector
            value={fromChain}
            onChange={(value) => {
              setFromChain(value);
              setFromToken(getNativeTokenAddress(value));
              setFromTokenMeta(undefined);
              if (value === toChain) setToToken(getPreferredSwapTargetToken(value));
              setQuote(undefined);
              setConfirmed(false);
            }}
            label="From chain"
            lifiOnly
          />
          <ChainSelector
            value={toChain}
            onChange={(value) => {
              setToChain(value);
              setToToken(value === fromChain ? getPreferredSwapTargetToken(value) : getNativeTokenAddress(value));
              setQuote(undefined);
              setConfirmed(false);
            }}
            label="To chain"
            lifiOnly
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TokenSelector
            chainId={fromChain}
            value={fromToken}
            label="From token"
            onChange={(value, token) => {
              setFromToken(value);
              setFromTokenMeta(token);
            }}
          />
          <TokenSelector chainId={toChain} value={toToken} label="To token" onChange={(value) => setToToken(value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label className="grid gap-2">
            Amount each
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Label>
          <Label className="grid gap-2">
            Slippage %
            <Input type="number" min="0.1" step="0.1" value={slippage} onChange={(event) => setSlippage(Number(event.target.value))} />
          </Label>
          <Label className="grid gap-2">
            Max total spend cap
            <Input value={maxSpendCap} onChange={(event) => setMaxSpendCap(event.target.value)} />
          </Label>
          <Label className="grid gap-2">
            Repeat count
            <Input
              type="number"
              min={1}
              max={MAX_REPEAT_COUNT}
              value={cappedRepeatCount}
              onChange={(event) => setRepeatCount(Number(event.target.value))}
            />
          </Label>
          <Label className="grid gap-2">
            Delay seconds
            <Input type="number" min={0} value={delaySeconds} onChange={(event) => setDelaySeconds(Number(event.target.value))} />
          </Label>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <label className="flex gap-2">
            <input type="checkbox" checked={stopOnFailure} onChange={(event) => setStopOnFailure(event.target.checked)} />
            Stop on first failure
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={freshQuote} onChange={(event) => setFreshQuote(event.target.checked)} />
            Require fresh quote before every repeat
          </label>
        </div>
        <div className="rounded-md border bg-background p-3 text-sm">
          <div className="mb-2 font-medium">Batch preview</div>
          <div className="grid gap-1 text-muted-foreground">
            <span>Repeats: {preview.repeats}</span>
            <span>Estimated total input: {preview.totalInput}</span>
            <span>Estimated total fees: {preview.fees}</span>
            <span>Estimated minimum received: {preview.minReceived}</span>
            {overSpendCap && <span className="text-red-200">Estimated input exceeds max spend cap.</span>}
          </div>
        </div>
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I reviewed the full batch preview and understand repeated swaps/bridges can lose money.
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => getQuote()} disabled={running || Boolean(routeSetupIssue)}>
            <RefreshCw className="h-4 w-4" />
            Refresh quote
          </Button>
          <Button onClick={startBatch} disabled={running || !confirmed || Boolean(routeSetupIssue)}>
            <Play className="h-4 w-4" />
            Start Batch
          </Button>
          <Button
            variant="outline"
            disabled={!running}
            onClick={() => {
              pauseRef.current = !pauseRef.current;
              setPaused(pauseRef.current);
              addLog(pauseRef.current ? "Batch paused." : "Batch resumed.", "warning");
            }}
          >
            <Pause className="h-4 w-4" />
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="destructive"
            disabled={!running}
            onClick={() => {
              stopRef.current = true;
              addLog("Stop requested. Current transaction, if already submitted, cannot be cancelled here.", "warning");
            }}
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
        {routeSetupIssue && <p className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{routeSetupIssue}</p>}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">Batch logs</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={logs.length === 0 || running}
            onClick={() => clearBatchLogs()}
          >
            Clear logs
          </Button>
        </div>
        <div className="max-h-64 overflow-auto rounded-md border bg-background p-3 text-sm">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">Batch logs will appear here.</p>
          ) : (
            <div className="grid gap-2">
              {logs.map((log) => (
                <div key={log.id} className="flex justify-between gap-3 border-b pb-2 last:border-b-0">
                  <span className={log.status === "error" ? "text-red-200" : log.status === "success" ? "text-emerald-200" : ""}>
                    {log.message}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function normalizeTxValue(value?: string) {
  if (!value) return "0x0";
  if (value.startsWith("0x")) return value;
  return toHex(BigInt(value));
}

function subscribeToBatchLogs(callback: () => void) {
  window.addEventListener("waap-batch-logs-changed", callback);
  return () => window.removeEventListener("waap-batch-logs-changed", callback);
}

function getBatchLogSnapshot() {
  return JSON.stringify(getBatchLogs());
}

function getRepeatSetupIssue({
  fromAddress,
  toAddress,
  fromIsSui,
  toIsSui,
  amount,
  maxSpendCap,
  estimatedInput,
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
  maxSpendCap: string;
  estimatedInput: number;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
}) {
  if (!fromAddress) return fromIsSui ? "Connect WaaP Sui before starting a repeat route." : "Connect WaaP before starting a repeat route.";
  if (!toAddress) return toIsSui ? "Connect WaaP Sui so LI.FI knows the Sui destination address." : "Connect WaaP so LI.FI knows the destination address.";
  if (!amount || Number(amount) <= 0) return "Enter an amount for each repeat.";
  if (estimatedInput > Number(maxSpendCap || 0)) return "Estimated total input exceeds the max total spend cap.";
  if (fromChain === toChain && fromToken.toLowerCase() === toToken.toLowerCase()) return "For same-chain repeat swaps, choose two different tokens.";
  return undefined;
}
