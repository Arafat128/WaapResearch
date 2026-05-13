"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { clearHistory, getHistory } from "@/lib/history";
import { formatTimestamp, shortAddress } from "@/lib/utils";
import type { TransactionRecord } from "@/types";

export function TransactionHistory() {
  const [history, setHistory] = useState<TransactionRecord[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(getHistory());
    refresh();
    window.addEventListener("waap-history-changed", refresh);
    return () => window.removeEventListener("waap-history-changed", refresh);
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Stored locally in this browser without secrets.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearHistory();
            setHistory([]);
          }}
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-2">
            {history.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-md border bg-background p-3 text-sm md:grid-cols-[1fr_auto]">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium uppercase">{item.type}</span>
                    <StatusBadge status={item.status} />
                    <span className="text-muted-foreground">{item.chainName}</span>
                  </div>
                  <span>
                    {item.amount} {item.token}
                  </span>
                  <span className="text-muted-foreground">{item.description}</span>
                  <span className="text-xs text-muted-foreground">{formatTimestamp(item.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  {item.hash && <span className="text-muted-foreground">{shortAddress(item.hash)}</span>}
                  {item.explorerUrl && (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={item.explorerUrl} target="_blank" rel="noreferrer" title="Open explorer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
