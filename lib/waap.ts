import { initWaaP } from "@human.tech/waap-sdk";
import type { Eip1193Provider, Hex } from "@/types";
import { toHexChainId } from "@/lib/chains";

let waapInitPromise: Promise<Eip1193Provider | null> | null = null;
let waapModalAllowed = false;
let waapModalManuallyHidden = false;
let waapSigningRequestId = 0;

export function initWaapOnce() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  // L3: if `window.waap` was already populated before our SDK init ran,
  // some other script (a malicious extension, a stray bundle) won the race.
  // Refuse to overwrite it so all wallet calls keep going to the entity the
  // user originally trusted, and surface a clear error.
  if (window.waap && !waapInitPromise) {
    waapInitPromise = Promise.resolve(window.waap as Eip1193Provider);
    return waapInitPromise;
  }

  if (!waapInitPromise) {
    const result = initWaaP({
      // referralCode MUST stay a top-level sibling of config/project — if it
      // ends up nested inside `config` Human Wallet won't register the
      // attribution. Override via NEXT_PUBLIC_WAAP_REFERRAL_CODE at deploy.
      referralCode: process.env.NEXT_PUBLIC_WAAP_REFERRAL_CODE ?? "boPYvnaw6J5gHgbv",
      config: {
        authenticationMethods: ["email", "phone", "social"],
        allowedSocials: ["google", "twitter", "discord"],
        styles: { darkMode: true },
        showSecured: true
      },
      project: {
        name: "Mehidy's Waap Tools",
        entryTitle: "Log in to WaaP Action Hub",
        authSuccessUrl: window.location.origin,
        authErrorUrl: window.location.origin
      },
      useStaging: false,
      asyncTxs: false
    });

    waapInitPromise = Promise.resolve(result as Eip1193Provider | null).then((provider) => {
      if (!window.waap && provider) {
        window.waap = provider;
      }
      return window.waap ?? provider ?? null;
    });
  }

  return waapInitPromise;
}

export function getWaapProvider(): Eip1193Provider {
  if (typeof window === "undefined" || !window.waap) {
    throw new Error("WaaP provider is not available. Connect with the WaaP SDK first.");
  }

  return window.waap;
}

export async function requestAccounts() {
  const provider = getWaapProvider();
  return provider.request<string[]>({ method: "eth_requestAccounts" });
}

export async function connectWaapAccounts() {
  const initialized = await initWaapOnce();
  const provider = initialized ?? getWaapProvider();
  setWaapModalAllowed(true);
  showWaapLoginModal();

  try {
    const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
    if (accounts.length > 0) return accounts;
  } catch {
    // No remembered session yet. Fall through to the explicit WaaP login modal.
  }

  if (!provider.login) {
    throw new Error("WaaP login is not available in this browser session.");
  }

  showWaapLoginModal();
  const loginMethod = await provider.login();
  if (!loginMethod) {
    throw new Error("WaaP login was closed before an account connected.");
  }

  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  if (!accounts.length) {
    throw new Error("WaaP login completed, but no wallet account was returned.");
  }
  return accounts;
}

export function setWaapModalAllowed(allowed: boolean) {
  waapModalAllowed = allowed;
  if (allowed) waapModalManuallyHidden = false;
}

export function showWaapLoginModal() {
  if (typeof document === "undefined") return;
  const containers = getWaapModalElements();
  for (const modal of containers.modals) {
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.zIndex = "9999999999";
  }
  for (const wrapper of containers.wrappers) {
    if (wrapper.style.display === "none") wrapper.style.display = "flex";
    wrapper.style.pointerEvents = "auto";
    wrapper.style.visibility = "visible";
    wrapper.style.opacity = "1";
  }
  for (const iframe of containers.iframes) {
    if (iframe.style.display === "none") iframe.style.display = "block";
    iframe.style.pointerEvents = "auto";
    iframe.style.visibility = "visible";
    iframe.style.opacity = "1";
  }
}

export function hideWaapLoginModal() {
  if (typeof document === "undefined") return;
  const containers = getWaapModalElements();
  for (const modal of containers.modals) {
    modal.style.display = "none";
    modal.style.pointerEvents = "auto";
  }
  for (const wrapper of containers.wrappers) {
    wrapper.style.display = "none";
    wrapper.style.pointerEvents = "none";
    wrapper.style.visibility = "hidden";
    wrapper.style.opacity = "0";
  }
  for (const iframe of containers.iframes) {
    iframe.style.display = "none";
    iframe.style.pointerEvents = "none";
    iframe.style.visibility = "hidden";
    iframe.style.opacity = "0";
  }
}

export function hideWaapLoginModalIfIdle() {
  if (waapModalAllowed && !waapModalManuallyHidden) {
    showWaapLoginModal();
    return;
  }
  hideWaapLoginModal();
}

export function toggleWaapLoginModal() {
  if (typeof document === "undefined") return;
  if (!waapModalAllowed) {
    hideWaapLoginModal();
    return;
  }
  if (isWaapLoginModalVisible()) {
    waapModalManuallyHidden = true;
    hideWaapLoginModal();
    return;
  }
  waapModalManuallyHidden = false;
  showWaapLoginModal();
}

export function beginWaapSigningUi() {
  const requestId = beginWaapSigningRequest();
  setWaapModalAllowed(true);
  restoreWaapSigningFrame();
  const visibilityKeeper = window.setInterval(() => {
    if (isCurrentWaapSigningRequest(requestId) && waapModalAllowed && !waapModalManuallyHidden) {
      restoreWaapSigningFrame();
    }
  }, 500);
  return { requestId, visibilityKeeper };
}

export function finishWaapSigningUi(requestId: number, visibilityKeeper: number) {
  window.clearInterval(visibilityKeeper);
  scheduleWaapSigningCleanup(requestId);
}

export function isWaapLoginModalVisible() {
  if (typeof document === "undefined") return false;
  const containers = getWaapModalElements();
  return containers.modals.some((modal) => {
    const style = window.getComputedStyle(modal);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  });
}

function getWaapModalElements() {
  return {
    modals: [
      document.getElementById("waap-wallet-iframe-container"),
      document.getElementById("silk-wallet-iframe-container")
    ].filter((element): element is HTMLElement => Boolean(element)),
    wrappers: [
      document.getElementById("waap-wallet-iframe-wrapper"),
      document.getElementById("silk-wallet-iframe-wrapper")
    ].filter((element): element is HTMLElement => Boolean(element)),
    iframes: [
      document.getElementById("waap-wallet-iframe"),
      document.getElementById("silk-wallet-iframe")
    ].filter((element): element is HTMLIFrameElement => Boolean(element))
  };
}

export async function getChainId() {
  const provider = getWaapProvider();
  const chainId = await provider.request<string>({ method: "eth_chainId" });
  return Number.parseInt(chainId, 16);
}

export async function getNativeBalance(address: string) {
  const provider = getWaapProvider();
  return provider.request<Hex>({
    method: "eth_getBalance",
    params: [address, "latest"]
  });
}

export async function switchChain(chainId: number) {
  const provider = getWaapProvider();
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: toHexChainId(chainId) }]
  });
}

export async function sendWaapTransaction(tx: {
  from: string;
  to: string;
  value?: Hex | string;
  data?: Hex | string;
  chainId: number;
}) {
  const provider = getWaapProvider();
  const { requestId, visibilityKeeper } = beginWaapSigningUi();
  try {
    const hash = await withTimeout(
      provider.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            value: tx.value ?? "0x0",
            data: tx.data,
            chainId: toHexChainId(tx.chainId)
          }
        ]
      }),
      90_000,
      "WaaP is still processing this signature after 90 seconds. Check your WaaP wallet activity/explorer, then refresh before retrying."
    );
    finishWaapSigningUi(requestId, visibilityKeeper);
    return hash;
  } catch (error) {
    finishWaapSigningUi(requestId, visibilityKeeper);
    throw error;
  } finally {
  }
}

function beginWaapSigningRequest() {
  waapSigningRequestId += 1;
  return waapSigningRequestId;
}

function isCurrentWaapSigningRequest(requestId: number) {
  return requestId === waapSigningRequestId;
}

function scheduleWaapSigningCleanup(requestId: number) {
  window.setTimeout(() => {
    if (!isCurrentWaapSigningRequest(requestId)) return;
    setWaapModalAllowed(false);
    hideWaapLoginModalIfIdle();
  }, 750);
}

function restoreWaapSigningFrame() {
  if (typeof document === "undefined") return;
  const containers = getWaapModalElements();
  for (const modal of containers.modals) {
    modal.style.pointerEvents = "auto";
  }
  for (const wrapper of containers.wrappers) {
    if (wrapper.style.display === "none") wrapper.style.display = "flex";
    wrapper.style.pointerEvents = "auto";
    wrapper.style.visibility = "visible";
    wrapper.style.opacity = "1";
  }
  for (const iframe of containers.iframes) {
    if (iframe.style.display === "none") iframe.style.display = "block";
    iframe.style.pointerEvents = "auto";
    iframe.style.visibility = "visible";
    iframe.style.opacity = "1";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function waitForTransactionReceipt(hash: string, timeoutMs = 120_000) {
  const provider = getWaapProvider();
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const receipt = await provider.request<{ status?: Hex } | null>({
      method: "eth_getTransactionReceipt",
      params: [hash]
    });
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
  }

  return null;
}

export function getWaapErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") {
    if (error.includes("Wallet ping timed out")) {
      return "WaaP login iframe timed out. Allow third-party/cross-site content for waap.xyz, disable blockers for localhost, then refresh and try again.";
    }
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybe = error as { message?: unknown; reason?: unknown; code?: unknown };
    const detail = typeof maybe.message === "string" ? maybe.message : typeof maybe.reason === "string" ? maybe.reason : "";
    const code = maybe.code !== undefined ? ` (${String(maybe.code)})` : "";
    if (detail.includes("Wallet ping timed out")) {
      return "WaaP login iframe timed out. Allow third-party/cross-site content for waap.xyz, disable blockers for localhost, then refresh and try again.";
    }
    if (detail) return `${detail}${code}`;
  }
  return "Unable to connect with WaaP.";
}
