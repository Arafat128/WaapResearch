import type { TransactionRecord } from "@/types";

const HISTORY_KEY = "waap-action-hub-history";
const SETTINGS_KEY = "waap-action-hub-settings";
const LOG_KEY = "waap-action-hub-batch-logs";

export type AppSettings = {
  defaultSlippage: number;
  preferredChains: number[];
  testnetMode: boolean;
  showMainnetWarning: boolean;
};

export type BatchLog = {
  id: string;
  timestamp: number;
  message: string;
  status: "info" | "success" | "error" | "warning";
};

export const defaultSettings: AppSettings = {
  defaultSlippage: 0.5,
  preferredChains: [11155111, 84532],
  testnetMode: true,
  showMainnetWarning: true
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  // L4: localStorage.setItem can throw on quota exceeded or in private-mode
  // Safari. Swallow the failure — history/settings are non-critical UX state
  // and a thrown exception here would unmount the calling React tree.
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore; the in-memory state still applies for this session.
  }
}

export function getHistory() {
  return readJson<TransactionRecord[]>(HISTORY_KEY, []);
}

export function saveHistory(history: TransactionRecord[]) {
  writeJson(HISTORY_KEY, history.slice(0, 100));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("waap-history-changed"));
}

export function upsertHistory(record: TransactionRecord) {
  const current = getHistory();
  const next = [record, ...current.filter((item) => item.id !== record.id)];
  saveHistory(next);
  return next;
}

export function clearHistory() {
  saveHistory([]);
}

export function getSettings() {
  return readJson<AppSettings>(SETTINGS_KEY, defaultSettings);
}

export function saveSettings(settings: AppSettings) {
  writeJson(SETTINGS_KEY, settings);
}

export function getBatchLogs() {
  return readJson<BatchLog[]>(LOG_KEY, []);
}

export function saveBatchLogs(logs: BatchLog[]) {
  writeJson(LOG_KEY, logs.slice(0, 200));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("waap-batch-logs-changed"));
}

export function clearBatchLogs() {
  saveBatchLogs([]);
}
