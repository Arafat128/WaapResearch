"use client";

import { useEffect, useState } from "react";
import { BookUser, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAddressBookEntry,
  getAddressBook,
  removeAddressBookEntry,
  subscribeAddressBook,
  type AddressBookEntry
} from "@/lib/address-book";
import { validateAddress } from "@/lib/erc20";
import { validateSuiAddress } from "@/lib/sui";
import { shortAddress } from "@/lib/utils";

export function AddressBook() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const refresh = () => setEntries(getAddressBook());
    refresh();
    return subscribeAddressBook(refresh);
  }, []);

  function save() {
    setError(undefined);
    const trimmed = address.trim();
    const isEvm = validateAddress(trimmed);
    const isSui = validateSuiAddress(trimmed);
    if (!isEvm && !isSui) {
      setError("Enter a valid EVM (0x…40 hex) or Sui address.");
      return;
    }
    try {
      addAddressBookEntry({ label, address: trimmed, kind: isSui && !isEvm ? "sui" : "evm" });
      setLabel("");
      setAddress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the address.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookUser className="h-5 w-5 text-primary" />
          Address Book
        </CardTitle>
        <CardDescription>
          Save labeled recipients to avoid pasting (and mistyping) addresses. Stored locally in this browser only.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Label className="grid gap-2">
            Label
            <Input placeholder="e.g. My Ledger" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Label>
          <Label className="grid gap-2">
            Address
            <Input placeholder="0x… or Sui address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Label>
          <Button type="button" onClick={save} disabled={!address.trim()}>
            Save
          </Button>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}

        {entries.length === 0 ? (
          <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            No saved addresses yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.label}</span>
                    <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                      {entry.kind}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{shortAddress(entry.address)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Copy address"
                    onClick={() => navigator.clipboard.writeText(entry.address)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove"
                    onClick={() => removeAddressBookEntry(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
