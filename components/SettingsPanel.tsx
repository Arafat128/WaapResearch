"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHAINS, MAX_REPEAT_COUNT } from "@/lib/chains";
import { defaultSettings, getSettings, saveSettings, type AppSettings } from "@/lib/history";

export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(() =>
    typeof window === "undefined" ? defaultSettings : getSettings()
  );

  function update(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Settings
        </CardTitle>
        <CardDescription>Preferences only. RPC configuration belongs in environment variables.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Label className="grid gap-2">
          Default slippage %
          <Input
            type="number"
            min="0.1"
            step="0.1"
            value={settings.defaultSlippage}
            onChange={(event) => update({ ...settings, defaultSlippage: Number(event.target.value) })}
          />
        </Label>
        <div className="grid gap-2">
          <Label>Preferred chains</Label>
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {CHAINS.map((chain) => (
              <label key={chain.id} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={settings.preferredChains.includes(chain.id)}
                  onChange={(event) => {
                    const nextChains = event.target.checked
                      ? [...settings.preferredChains, chain.id]
                      : settings.preferredChains.filter((id) => id !== chain.id);
                    update({ ...settings, preferredChains: nextChains });
                  }}
                />
                {chain.name}
              </label>
            ))}
          </div>
        </div>
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={settings.testnetMode}
            onChange={(event) => update({ ...settings, testnetMode: event.target.checked })}
          />
          Testnet-first mode
        </label>
        <label className="flex gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={settings.showMainnetWarning}
            onChange={(event) => update({ ...settings, showMainnetWarning: event.target.checked })}
          />
          Mainnet warning toggle
        </label>
        <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
          Max repeat count is configured in code as <strong className="text-foreground">{MAX_REPEAT_COUNT}</strong>. Infinite
          loops are not supported.
        </div>
      </CardContent>
    </Card>
  );
}
