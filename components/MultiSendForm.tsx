"use client";

import { useMemo, useRef, useState } from "react";
import { ListChecks, Send, Square } from "lucide-react";
import { parseEther, parseUnits, toHex } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChainSelector } from "@/components/ChainSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWaap } from "@/components/WaapProvider";
import { encodeErc20Transfer, validateAddress } from "@/lib/erc20";
import { explorerTxUrl, getChain, isSuiChain } from "@/lib/chains";
import { upsertHistory } from "@/lib/history";
import { sendWaapTransaction, switchChain, waitForTransactionReceipt } from "@/lib/waap";
import { sendSuiTransaction, validateSuiAddress, waitForSuiTransaction } from "@/lib/sui";
import type { TransactionRecord } from "@/types";

const MAX_MULTI_SEND_RECIPIENTS = 25;

type RecipientRow = {
  address: string;
  amount: string;
};

export function MultiSendForm({ defaultChainId }: { defaultChainId: number }) {
  const { address, suiAccount } = useWaap();
  const [chainId, setChainId] = useState(defaultChainId);
  const [assetType, setAssetType] = useState<"native" | "erc20">("native");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [sameAmount, setSameAmount] = useState("");
  const [maxTotalSpend, setMaxTotalSpend] = useState("1");
  const [recipientsText, setRecipientsText] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Paste recipients to build a preview.");
  const stopRef = useRef(false);
  const chain = getChain(chainId);
  const isSui = isSuiChain(chainId);
  const senderAddress = isSui ? suiAccount?.address : address;

  const recipients = useMemo(() => parseRecipients(recipientsText, sameAmount), [recipientsText, sameAmount]);
  const totalAmount = useMemo(
    () => recipients.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [recipients]
  );
  const hasInvalidRows = useMemo(
    () => recipients.some((row) => (isSui ? !validateSuiAddress(row.address) : !validateAddress(row.address)) || !row.amount || Number(row.amount) <= 0),
    [isSui, recipients]
  );

  function buildPreview() {
    try {
      validateForm();
      setPreviewed(true);
      setConfirmed(false);
      setStatus(`Preview ready: ${recipients.length} transfer(s), total ${formatAmount(totalAmount)}.`);
    } catch (error) {
      setPreviewed(false);
      setStatus(error instanceof Error ? error.message : "Unable to build preview.");
    }
  }

  async function startMultiSend() {
    setRunning(true);
    stopRef.current = false;
    try {
      validateForm();
      if (!senderAddress) throw new Error("Connect WaaP first.");
      if (isSui && !suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
      if (!previewed || !confirmed) throw new Error("Preview the batch and check the confirmation box first.");

      if (!isSui) await switchChain(chainId);
      setStatus(`Starting ${recipients.length} sequential transfer(s). WaaP confirmation remains manual for each transaction.`);

      for (let index = 0; index < recipients.length; index += 1) {
        if (stopRef.current) {
          setStatus("Multi-send stopped. Already-submitted transactions cannot be cancelled here.");
          break;
        }

        const row = recipients[index];
        const id = crypto.randomUUID();
        const tokenLabel = assetType === "native" ? chain.nativeCurrency : tokenAddress;
        const pending: TransactionRecord = {
          id,
          type: "multi-send",
          chainId,
          chainName: chain.name,
          token: tokenLabel,
          amount: row.amount,
          status: "pending",
          timestamp: Number(new Date()),
          description: `Multi-send ${index + 1}/${recipients.length} to ${row.address}`
        };
        upsertHistory(pending);
        setStatus(`Transfer ${index + 1}/${recipients.length}: waiting for WaaP confirmation.`);

        try {
          let hash: string;
          let finalStatus: TransactionRecord["status"];
          if (isSui) {
            if (!suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
            hash = await sendSuiTransaction({ account: suiAccount, recipient: row.address, amount: row.amount });
            upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: "pending" });
            const receipt = await waitForSuiTransaction(hash);
            finalStatus = receipt.effects?.status?.status === "failure" ? "failed" : "confirmed";
          } else {
            const tx =
              assetType === "native"
                ? { from: senderAddress, to: row.address, value: toHex(parseEther(row.amount)), chainId }
                : {
                    from: senderAddress,
                    to: tokenAddress,
                    value: "0x0",
                    data: encodeErc20Transfer(row.address, row.amount, tokenDecimals),
                    chainId
                  };
            hash = await sendWaapTransaction(tx);
            upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: "pending" });
            const receipt = await waitForTransactionReceipt(hash);
            finalStatus = receipt?.status === "0x0" ? "failed" : receipt ? "confirmed" : "pending";
          }
          upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: finalStatus });
          setStatus(`Transfer ${index + 1}/${recipients.length} ${finalStatus}: ${hash}`);
          if (finalStatus === "failed") break;
        } catch (error) {
          upsertHistory({
            ...pending,
            status: "failed",
            description: error instanceof Error ? error.message : "Multi-send transfer failed."
          });
          setStatus(error instanceof Error ? error.message : "Multi-send transfer failed.");
          break;
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to start multi-send.");
    } finally {
      setRunning(false);
      setConfirmed(false);
    }
  }

  function validateForm() {
    if (recipients.length === 0) throw new Error("Add at least one recipient.");
    if (recipients.length > MAX_MULTI_SEND_RECIPIENTS) {
      throw new Error(`Multi-send is capped at ${MAX_MULTI_SEND_RECIPIENTS} recipients per batch.`);
    }
    if (hasInvalidRows) throw new Error("Each row needs a valid address and positive amount.");
    if (isSui && assetType !== "native") throw new Error("Sui multi-send currently supports native SUI only.");
    if (!isSui && assetType === "erc20" && !validateAddress(tokenAddress)) throw new Error("Token contract address is invalid.");
    if (totalAmount > Number(maxTotalSpend || 0)) throw new Error("Total amount exceeds the max total spend cap.");
    if (isSui) {
      for (const row of recipients) {
        parseUnits(row.amount, 9);
      }
    } else if (assetType === "erc20") {
      for (const row of recipients) {
        parseUnits(row.amount, tokenDecimals);
      }
    } else {
      for (const row of recipients) {
        parseEther(row.amount);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Multi-Send
        </CardTitle>
        <CardDescription>Send the selected chain token to multiple wallets sequentially from one batch start.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ChainSelector
          value={chainId}
          onChange={(value) => {
            setChainId(value);
            if (isSuiChain(value)) setAssetType("native");
            setPreviewed(false);
            setConfirmed(false);
          }}
          label="Send on chain"
        />
        {!chain.testnet && (
          <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Mainnet multi-send. Test with tiny amounts first. WaaP will still require manual confirmation for each transfer.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Asset type</span>
            <Select value={assetType} disabled={isSui} onChange={(event) => setAssetType(event.target.value as "native" | "erc20")}>
              <option value="native">{isSui ? "Native SUI" : "Native token"}</option>
              {!isSui && <option value="erc20">ERC20 token</option>}
            </Select>
          </label>
          <Label className="grid gap-2">
            Same amount for all
            <Input value={sameAmount} onChange={(event) => setSameAmount(event.target.value)} placeholder="Optional" />
          </Label>
          <Label className="grid gap-2">
            Max total spend
            <Input value={maxTotalSpend} onChange={(event) => setMaxTotalSpend(event.target.value)} />
          </Label>
        </div>
        {assetType === "erc20" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Label className="grid gap-2">
              Token contract
              <Input placeholder="0x..." value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} />
            </Label>
            <Label className="grid gap-2">
              Decimals
              <Input
                type="number"
                min={0}
                max={36}
                value={tokenDecimals}
                onChange={(event) => setTokenDecimals(Number(event.target.value))}
              />
            </Label>
          </div>
        )}
        <Label className="grid gap-2">
          Recipients
          <Textarea
            value={recipientsText}
            onChange={(event) => {
              setRecipientsText(event.target.value);
              setPreviewed(false);
              setConfirmed(false);
            }}
            placeholder={isSui ? "One per line:\n0xSuiAddress amount\n0xSuiAddress,amount\n0xSuiAddress (uses same amount field)" : "One per line:\n0xWallet amount\n0xWallet,amount\n0xWallet (uses same amount field)"}
          />
        </Label>
        <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
          <div>Recipients: {recipients.length} / {MAX_MULTI_SEND_RECIPIENTS}</div>
          <div>Total amount: {formatAmount(totalAmount)} {assetType === "native" ? chain.nativeCurrency : "tokens"}</div>
          {hasInvalidRows && <div className="text-red-200">Some rows are invalid.</div>}
        </div>
        {previewed && (
          <div className="max-h-56 overflow-y-auto rounded-md border bg-background p-3 text-sm">
            <div className="mb-2 font-medium">Batch preview</div>
            <div className="grid gap-2">
              {recipients.map((row, index) => (
                <div key={`${row.address}-${index}`} className="flex justify-between gap-3 border-b pb-2 last:border-b-0">
                  <span className="break-all">{row.address}</span>
                  <span className="shrink-0">{row.amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I reviewed every recipient and amount. I understand WaaP will ask me to confirm each transaction.
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={buildPreview} disabled={running}>
            Preview
          </Button>
          <Button onClick={startMultiSend} disabled={running || !previewed || !confirmed}>
            <Send className="h-4 w-4" />
            Start Multi-Send
          </Button>
          <Button
            variant="destructive"
            disabled={!running}
            onClick={() => {
              stopRef.current = true;
              setStatus("Stop requested. Current WaaP transaction may still need cancellation in the popup.");
            }}
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{status}</p>
      </CardContent>
    </Card>
  );
}

function parseRecipients(value: string, sameAmount: string): RecipientRow[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [address = "", amount = ""] = line.split(/[,\s]+/).filter(Boolean);
      return { address, amount: amount || sameAmount };
    });
}

function formatAmount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}
