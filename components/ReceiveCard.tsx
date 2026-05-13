"use client";

import { Copy, ExternalLink, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChainSelector } from "@/components/ChainSelector";
import { useWaap } from "@/components/WaapProvider";
import { explorerAddressUrl, isSuiChain } from "@/lib/chains";
import { shortAddress } from "@/lib/utils";

export function ReceiveCard({ chainId, onChainChange }: { chainId: number; onChainChange: (chainId: number) => void }) {
  const { address, suiAddress } = useWaap();
  const receiveAddress = isSuiChain(chainId) ? suiAddress : address;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          Receive
        </CardTitle>
        <CardDescription>To receive tokens, send them to this address on the selected chain.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ChainSelector value={chainId} onChange={onChainChange} label="Receive on" />
        <div className="grid gap-3 rounded-md border bg-background p-4">
          <div className="flex justify-center rounded-md bg-white p-4">
            {receiveAddress ? <QRCodeCanvas value={receiveAddress} size={164} /> : <div className="h-[164px] w-[164px] bg-slate-200" />}
          </div>
          <p className="break-all text-center text-sm text-muted-foreground">{receiveAddress ?? "Connect WaaP to show address"}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              disabled={!receiveAddress}
              onClick={() => receiveAddress && navigator.clipboard.writeText(receiveAddress)}
            >
              <Copy className="h-4 w-4" />
              Copy address
            </Button>
            <Button variant="outline" asChild>
              <a href={receiveAddress ? explorerAddressUrl(chainId, receiveAddress) : "#"} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {shortAddress(receiveAddress)}
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
