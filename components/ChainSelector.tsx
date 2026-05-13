"use client";

import { Select } from "@/components/ui/select";
import { CHAINS, getLifiSupportedChains } from "@/lib/chains";

export function ChainSelector({
  value,
  onChange,
  testnetOnly = false,
  lifiOnly = false,
  label = "Chain"
}: {
  value: number;
  onChange: (chainId: number) => void;
  testnetOnly?: boolean;
  lifiOnly?: boolean;
  label?: string;
}) {
  const chains = lifiOnly ? getLifiSupportedChains() : testnetOnly ? CHAINS.filter((chain) => chain.testnet) : CHAINS;

  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <Select value={String(chains.some((chain) => chain.id === value) ? value : chains[0]?.id)} onChange={(event) => onChange(Number(event.target.value))}>
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name} {chain.testnet ? "(testnet)" : "(mainnet)"}
          </option>
        ))}
      </Select>
    </label>
  );
}
