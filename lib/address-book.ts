import { isAddress } from "viem";
import { isValidSuiAddress } from "@mysten/sui/utils";

export type AddressBookEntry = {
  id: string;
  label: string;
  address: string;
  /** "evm" | "sui" so we can warn if a user picks the wrong kind for a chain. */
  kind: "evm" | "sui";
  createdAt: number;
};

const STORAGE_KEY = "waap-tools-address-book";
const MAX_ENTRIES = 100;

/**
 * Same defence-in-depth pattern as the LI.FI token cache (M4): validate every
 * stored entry's address shape on READ, not just on write. These entries feed
 * the SendForm recipient datalist, so a poisoned cache must not be able to
 * surface a malformed address. Entries whose address doesn't match their
 * declared kind, or whose kind is unknown, are dropped.
 */
function isValidEntry(e: unknown): e is AddressBookEntry {
  if (!e || typeof e !== "object") return false;
  const entry = e as Record<string, unknown>;
  if (typeof entry.address !== "string" || typeof entry.label !== "string") return false;
  if (entry.kind !== "evm" && entry.kind !== "sui") return false;
  return entry.kind === "sui" ? isValidSuiAddress(entry.address) : isAddress(entry.address);
}

function read(): AddressBookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function write(entries: AddressBookEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event("waap-address-book-changed"));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getAddressBook(): AddressBookEntry[] {
  return read().sort((a, b) => a.label.localeCompare(b.label));
}

export function addAddressBookEntry(entry: { label: string; address: string; kind: "evm" | "sui" }) {
  const entries = read();
  const normalizedAddress = entry.address.trim();
  // De-dupe by address (case-insensitive for EVM).
  const exists = entries.some(
    (e) => e.address.toLowerCase() === normalizedAddress.toLowerCase()
  );
  if (exists) {
    throw new Error("That address is already in your address book.");
  }
  const next: AddressBookEntry = {
    id: crypto.randomUUID(),
    label: entry.label.trim() || normalizedAddress,
    address: normalizedAddress,
    kind: entry.kind,
    createdAt: Date.now()
  };
  write([next, ...entries]);
  return next;
}

export function removeAddressBookEntry(id: string) {
  write(read().filter((e) => e.id !== id));
}

export function subscribeAddressBook(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("waap-address-book-changed", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("waap-address-book-changed", callback);
    window.removeEventListener("storage", callback);
  };
}
