"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useWaap } from "@/components/WaapProvider";

const REPORTED_KEY = "waap-tools-login-reported";
const POLL_MS = 30_000;

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const data = new TextEncoder().encode(input.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function LoginCounter() {
  const { address, suiAddress } = useWaap();
  const [count, setCount] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  // Initial fetch + slow poll so the chip stays roughly current without
  // hammering the API.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stats/login", {
          cache: "no-store",
          headers: { "x-requested-with": "fetch" }
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number | null; configured: boolean };
        if (cancelled) return;
        setCount(data.count);
        setConfigured(data.configured);
      } catch {
        // ignore — chip will show "—"
      }
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Report this user once per browser per connected address. Storing the
  // reported address in localStorage avoids inflating the count on every
  // reload while still catching new wallets the user might switch to.
  useEffect(() => {
    const wallet = address ?? suiAddress;
    if (!wallet) return;
    let cancelled = false;

    async function report() {
      try {
        const reported = window.localStorage.getItem(REPORTED_KEY);
        if (reported === wallet) return;
        if (!wallet) return;
        const id = await sha256Hex(wallet);
        if (!id || cancelled) return;
        const res = await fetch("/api/stats/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-requested-with": "fetch" },
          body: JSON.stringify({ id })
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number | null; configured: boolean };
        if (cancelled) return;
        setCount(data.count);
        setConfigured(data.configured);
        try {
          window.localStorage.setItem(REPORTED_KEY, wallet);
        } catch {
          // ignore quota
        }
      } catch {
        // ignore
      }
    }
    report();
    return () => {
      cancelled = true;
    };
  }, [address, suiAddress]);

  // If the operator hasn't wired up KV, hide the chip entirely — better than
  // showing "0 users" forever.
  if (configured === false) return null;

  const label = count === null ? "…" : count.toLocaleString();

  return (
    <div
      className="fixed right-4 top-4 z-40 flex items-center gap-2 rounded-full border border-sky-400/30 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-sky-100 backdrop-blur-md shadow-lg sm:text-sm"
      title="Unique wallets that have connected to Waap Tools"
      aria-live="polite"
    >
      <Users className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
      <span className="tabular-nums">{label}</span>
      <span className="hidden text-sky-300/80 sm:inline">unique users</span>
    </div>
  );
}
