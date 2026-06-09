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

function read(): AddressBookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddressBookEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.address === "string" && typeof e.label === "string"
    );
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
