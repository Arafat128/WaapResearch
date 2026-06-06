"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock, ShieldCheck, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RepeatActionTool } from "@/components/RepeatActionTool";

/**
 * UX gate around the Repeat Swap / Bridge Tool. The tab is marked as
 * "disabled & under development" and only renders the real tool once the user
 * supplies the correct password.
 *
 * SECURITY NOTE: this is a *soft* gate, not a security boundary. The password
 * hash lives in `NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH` (or the fallback
 * below), which means any visitor can see the hash in the JS bundle and could
 * brute-force a short password. Use a long, high-entropy passphrase, and treat
 * this primarily as an "are you sure you know what you're doing" speed bump
 * during development. Hard security must come from on-chain checks + the
 * confirmation UX inside the tool itself.
 */

// SHA-256("waap-dev-2026") — replace by setting NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH
const DEFAULT_PASSWORD_HASH =
  "8c82980562af790878b048aa69119ad7b9a78ba6307680ea28bd2d719da38da9";
const SESSION_KEY = "waap-repeat-tool-unlocked";

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // Older browser fallback — return a value that will never match the hash
    // so the gate fails closed rather than open.
    return "no-subtlecrypto";
  }
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function RepeatActionGate({ defaultChainId }: { defaultChainId: number }) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // M3: don't trust a bare "1" flag in sessionStorage. Read back the stored
    // value and only unlock if it equals the configured password hash. That
    // way a curious user with DevTools can't set the flag without knowing
    // the hash, and a stolen flag from one deploy won't unlock another.
    try {
      const expected =
        process.env.NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH?.trim() || DEFAULT_PASSWORD_HASH;
      if (window.sessionStorage.getItem(SESSION_KEY) === expected) {
        setUnlocked(true);
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // sessionStorage unavailable — keep locked.
    }
  }, []);

  async function attemptUnlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const expected =
        process.env.NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH?.trim() || DEFAULT_PASSWORD_HASH;
      const actual = await sha256Hex(password);
      if (actual === expected) {
        setUnlocked(true);
        try {
          // M3: persist the hash itself (not a magic "1") — see useEffect.
          window.sessionStorage.setItem(SESSION_KEY, expected);
        } catch {
          // ignore
        }
        setPassword("");
      } else {
        setError("Incorrect password. This tool stays disabled until the correct dev passphrase is entered.");
      }
    } finally {
      setBusy(false);
    }
  }

  function relock() {
    setUnlocked(false);
    setPassword("");
    setError(undefined);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  if (unlocked) {
    return (
      <div className="flex flex-col gap-3">
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-400" />
              <div className="text-sm">
                <p className="font-semibold text-amber-200">Repeat tool unlocked for this session.</p>
                <p className="text-amber-300/80">
                  This feature is still under development. Test only on testnets and tiny amounts.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={relock}>
              <Lock className="h-4 w-4" />
              Lock again
            </Button>
          </CardContent>
        </Card>
        <RepeatActionTool defaultChainId={defaultChainId} />
      </div>
    );
  }

  return (
    <Card className="border-red-500/40 bg-red-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-200">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          Repeat Swap / Bridge Tool — disabled
        </CardTitle>
        <CardDescription className="text-red-300/85">
          This tab is <strong>under development</strong> and disabled by default. The repeat batch
          executes real on-chain transactions in sequence and can lose funds to gas, slippage,
          bridge fees, MEV, or price movement. To prevent accidental use it is hidden behind a
          developer password. Enter the passphrase only if you understand the risks and are
          testing on testnets with small values.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={attemptUnlock} className="grid gap-3 sm:max-w-md">
          <div className="grid gap-1.5">
            <Label htmlFor="repeat-tool-password">Developer passphrase</Label>
            <Input
              id="repeat-tool-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter passphrase to enable the tool"
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !password}>
              <Unlock className="h-4 w-4" />
              {busy ? "Checking..." : "Unlock tool"}
            </Button>
            <p className="self-center text-xs text-muted-foreground">
              Session-scoped — relocks when the tab is closed.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
