"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Eye, Send } from "lucide-react";
import { parseEther, toHex } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ChainSelector } from "@/components/ChainSelector";
import { useWaap } from "@/components/WaapProvider";
import { encodeErc20Transfer, validateAddress } from "@/lib/erc20";
import { explorerTxUrl, getChain, isSuiChain } from "@/lib/chains";
import { sendWaapTransaction, switchChain, waitForTransactionReceipt } from "@/lib/waap";
import { sendSuiTransaction, validateSuiAddress, waitForSuiTransaction } from "@/lib/sui";
import { upsertHistory } from "@/lib/history";
import type { TransactionRecord } from "@/types";

export function SendForm({ defaultChainId }: { defaultChainId: number }) {
  const { address, suiAccount } = useWaap();
  const [chainId, setChainId] = useState(defaultChainId);
  const [assetType, setAssetType] = useState<"native" | "erc20">("native");
  const [recipient, setRecipient] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const chain = getChain(chainId);
  const isSui = isSuiChain(chainId);
  const senderAddress = isSui ? suiAccount?.address : address;

  const preview = useMemo(() => {
    if (!senderAddress || !amount || !recipient) return undefined;
    return {
      from: senderAddress,
      to: assetType === "native" ? recipient : tokenAddress,
      amount,
      token: assetType === "native" ? chain.nativeCurrency : tokenAddress,
      network: chain.name,
      mode: isSui ? "native SUI transfer" : assetType === "native" ? "native transfer" : "ERC20 transfer"
    };
  }, [amount, assetType, chain.name, chain.nativeCurrency, isSui, recipient, senderAddress, tokenAddress]);

  async function execute() {
    setBusy(true);
    setStatus(undefined);
    const id = crypto.randomUUID();
    try {
      if (!senderAddress) throw new Error("Connect WaaP first.");
      if (isSui && !suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
      if (isSui && !validateSuiAddress(recipient)) throw new Error("Recipient Sui address is invalid.");
      if (!isSui && !validateAddress(recipient)) throw new Error("Recipient address is invalid.");
      if (assetType === "erc20" && !validateAddress(tokenAddress)) throw new Error("Token contract address is invalid.");
      if (!previewed || !confirmed) throw new Error("Preview the transaction and check the confirmation box first.");

      const pending: TransactionRecord = {
        id,
        type: "send",
        chainId,
        chainName: chain.name,
        token: assetType === "native" ? chain.nativeCurrency : tokenAddress,
        amount,
        status: "pending",
        timestamp: Date.now(),
        description: `${preview?.mode} to ${recipient}`
      };
      upsertHistory(pending);

      let hash: string;
      let finalStatus: TransactionRecord["status"];
      if (isSui) {
        if (!suiAccount) throw new Error("Connect WaaP Sui first by clicking Connect WaaP or Use Sui.");
        hash = await sendSuiTransaction({ account: suiAccount, recipient, amount });
        upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: "pending" });
        const receipt = await waitForSuiTransaction(hash);
        finalStatus = receipt.effects?.status?.status === "failure" ? "failed" : "confirmed";
      } else {
        await switchChain(chainId);
        const tx =
          assetType === "native"
            ? { from: senderAddress, to: recipient, value: toHex(parseEther(amount)), chainId }
            : {
                from: senderAddress,
                to: tokenAddress,
                value: "0x0",
                data: encodeErc20Transfer(recipient, amount, tokenDecimals),
                chainId
              };
        hash = await sendWaapTransaction(tx);
        upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: "pending" });
        const receipt = await waitForTransactionReceipt(hash);
        finalStatus = receipt?.status === "0x0" ? "failed" : receipt ? "confirmed" : "pending";
      }
      upsertHistory({ ...pending, hash, explorerUrl: explorerTxUrl(chainId, hash), status: finalStatus });
      setStatus(`Transaction ${finalStatus}: ${hash}`);
      setConfirmed(false);
      setPreviewed(false);
    } catch (error) {
      upsertHistory({
        id,
        type: "send",
        chainId,
        chainName: chain.name,
        token: isSui ? "SUI" : assetType === "native" ? chain.nativeCurrency : tokenAddress || "ERC20",
        amount,
        status: "failed",
        timestamp: Date.now(),
        description: error instanceof Error ? error.message : "Send failed."
      });
      setStatus(error instanceof Error ? error.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Send
        </CardTitle>
        <CardDescription>Preview every transaction before WaaP asks you to sign.</CardDescription>
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
        />
        {!chain.testnet && <Warning>Mainnet action. Verify the address, token, and amount carefully.</Warning>}
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Asset type</span>
          <Select value={assetType} disabled={isSui} onChange={(event) => setAssetType(event.target.value as "native" | "erc20")}>
            <option value="native">{isSui ? "Native SUI" : "Native token"}</option>
            {!isSui && <option value="erc20">ERC20 token</option>}
          </Select>
        </label>
        <Label className="grid gap-2">
          Recipient address
          <Input placeholder={isSui ? "0x... Sui address" : "0x..."} value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        </Label>
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
          Amount
          <Input inputMode="decimal" placeholder="0.0" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPreviewed(Boolean(preview))} disabled={!preview}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button onClick={execute} disabled={busy || !previewed || !confirmed}>
            <ArrowRight className="h-4 w-4" />
            Send
          </Button>
        </div>
        {previewed && preview && (
          <div className="grid gap-2 rounded-md border bg-background p-3 text-sm">
            <strong>Transaction preview</strong>
            <span>Type: {preview.mode}</span>
            <span>Network: {preview.network}</span>
            <span className="break-all">To: {preview.to}</span>
            <span>
              Amount: {preview.amount} {preview.token}
            </span>
          </div>
        )}
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I reviewed the transaction preview and understand this action cannot be reversed.
        </label>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{children}</div>;
}
