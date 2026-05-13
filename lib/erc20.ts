import { decodeFunctionResult, encodeFunctionData, isAddress, parseUnits } from "viem";
import { getWaapProvider, sendWaapTransaction, waitForTransactionReceipt } from "@/lib/waap";
import type { Hex } from "@/types";

export const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export function validateAddress(value: string) {
  return isAddress(value);
}

export function encodeErc20Transfer(recipient: string, amount: string, decimals: number) {
  if (!isAddress(recipient)) {
    throw new Error("Recipient address is invalid.");
  }

  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, parseUnits(amount, decimals)]
  });
}

export async function readErc20Allowance(token: string, owner: string, spender: string) {
  const provider = getWaapProvider();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner as Hex, spender as Hex]
  });
  const result = await provider.request<Hex>({
    method: "eth_call",
    params: [{ to: token as Hex, data }, "latest"]
  });
  return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: result });
}

export async function readErc20Balance(token: string, owner: string) {
  const provider = getWaapProvider();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as Hex]
  });
  const result = await provider.request<Hex>({
    method: "eth_call",
    params: [{ to: token as Hex, data }, "latest"]
  });
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: result });
}

export async function approveErc20Spend(params: {
  token: string;
  owner: string;
  spender: string;
  amount: bigint;
  chainId: number;
}) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [params.spender as Hex, params.amount]
  });
  const hash = await sendWaapTransaction({
    from: params.owner,
    to: params.token as Hex,
    value: "0x0",
    data,
    chainId: params.chainId
  });
  const receipt = await waitForTransactionReceipt(hash);
  if (receipt?.status === "0x0") {
    throw new Error("ERC20 approval failed on-chain.");
  }
  return hash;
}
