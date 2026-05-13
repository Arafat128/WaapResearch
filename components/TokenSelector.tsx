"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { fetchTokens } from "@/lib/lifi";
import { getNativeTokenAddress, isSuiChain } from "@/lib/chains";
import type { TokenOption } from "@/types";

export function TokenSelector({
  chainId,
  value,
  onChange,
  label
}: {
  chainId: number;
  value: string;
  onChange: (address: string, token?: TokenOption) => void;
  label: string;
}) {
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [custom, setCustom] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const nativeTokenAddress = getNativeTokenAddress(chainId);

  useEffect(() => {
    let mounted = true;
    fetchTokens(chainId)
      .then((items) => {
        if (!mounted) return;
        setLoadError(undefined);
        setCustom(false);
        setTokens(items);
      })
      .catch(() => {
        if (!mounted) return;
        setTokens([]);
        setLoadError("Token list is unavailable. Use a custom token address or try again.");
      });
    return () => {
      mounted = false;
    };
  }, [chainId]);

  const selectedTokenIsListed = tokens.some((token) => token.address.toLowerCase() === value.toLowerCase());
  const selectedValue =
    custom || ((tokens.length > 0 || loadError) && value !== nativeTokenAddress && !selectedTokenIsListed) ? "custom" : value || nativeTokenAddress;

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select
        value={selectedValue}
        onChange={(event) => {
          if (event.target.value === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          const token = tokens.find((item) => item.address === event.target.value);
          onChange(event.target.value, token);
        }}
      >
        {tokens.map((token) => (
          <option key={`${token.chainId}-${token.address}`} value={token.address}>
            {token.symbol} - {token.name}
          </option>
        ))}
        <option value="custom">Custom token address</option>
      </Select>
      {loadError && <p className="text-xs text-amber-100">{loadError}</p>}
      {selectedValue === "custom" && (
        <Input
          placeholder={isSuiChain(chainId) ? "0x2::coin::TYPE" : "0x..."}
          value={value === nativeTokenAddress ? "" : value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
