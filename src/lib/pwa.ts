const UPDATE_EVENT = 'docbd:pwa-update-available';
const INSTALL_AVAILABILITY_EVENT = 'docbd:pwa-install-availability';
const INSTALLED_EVENT = 'docbd:pwa-installed';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export const PWA_INSTALL_PROMPT_LAST_SHOWN_KEY = 'pwa_install_prompt_last_shown';
const PWA_INSTALLED_MARKER_KEY = 'docbd_pwa_installed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaInstallTarget = 'native' | 'ios-safari' | null;
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

let registrationRef: ServiceWorkerRegistration | null = null;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let reloadForUpdate = false;
let serviceWorkerInitialized = false;
let installExperienceInitialized = false;
let installedInSession = false;

function notifyUpdateAvailable() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function notifyInstallAvailability() {
  window.dispatchEvent(new CustomEvent(INSTALL_AVAILABILITY_EVENT));
}

function notifyInstalled() {
  window.dispatchEvent(new CustomEvent(INSTALLED_EVENT));
}

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in hardened/private browser configurations.
  }
}

export function localCalendarDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isInstallPromotionDue(lastShown: string | null, now = new Date()) {
  return lastShown !== localCalendarDateKey(now);
}

export function claimPwaInstallPromotionForToday(now = new Date()) {
  const today = localCalendarDateKey(now);
  if (!isInstallPromotionDue(safeStorageGet(PWA_INSTALL_PROMPT_LAST_SHOWN_KEY), now)) return false;
  // Claim before rendering. If persistent storage is unavailable, suppress the promotion
  // instead of risking repeated prompts after reloads.
  return safeStorageSet(PWA_INSTALL_PROMPT_LAST_SHOWN_KEY, today);
}

export function isIosSafariEnvironment(userAgent: string, platform: string, maxTouchPoints: number) {
  const iosUserAgent = /iPad|iPhone|iPod/i.test(userAgent);
  const iPadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;
  if (!iosUserAgent && !iPadDesktopMode) return false;
  const safariEngine = /Safari/i.test(userAgent);
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/i.test(userAgent);
  return safariEngine && !otherIosBrowser;
}

function isIosSafari() {
  return isIosSafariEnvironment(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

export function isStandaloneEnvironment(displayModeStandalone: boolean, navigatorStandalone: boolean) {
  return displayModeStandalone || navigatorStandalone;
}

export function isPwaInstalled() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return installedInSession
    || isStandaloneEnvironment(window.matchMedia('(display-mode: standalone)').matches, navigatorWithStandalone.standalone === true)
    || safeStorageGet(PWA_INSTALLED_MARKER_KEY) === '1';
}

export function getPwaInstallTarget(): PwaInstallTarget {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || isPwaInstalled()) return null;
  if (deferredInstallPrompt) return 'native';
  if (isIosSafari()) return 'ios-safari';
  return null;
}

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  if (isPwaInstalled()) return 'accepted';
  const promptEvent = deferredInstallPrompt;
  if (!promptEvent) return 'unavailable';

  // A BeforeInstallPromptEvent can only be used once.
  deferredInstallPrompt = null;
  notifyInstallAvailability();

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      installedInSession = true;
      safeStorageSet(PWA_INSTALLED_MARKER_KEY, '1');
      notifyInstalled();
    }
    return choice.outcome;
  } catch {
    return 'unavailable';
  } finally {
    notifyInstallAvailability();
  }
}

function initializePwaInstallExperience() {
  if (installExperienceInitialized || typeof window === 'undefined' || typeof navigator === 'undefined') return;
  installExperienceInitialized = true;

  window.addEventListener('beforeinstallprompt', ((event: Event) => {
    const installEvent = event as BeforeInstallPromptEvent;
    installEvent.preventDefault();
    // If the browser offers installation again, a persisted marker may be stale after an uninstall.
    safeStorageRemove(PWA_INSTALLED_MARKER_KEY);
    installedInSession = false;
    deferredInstallPrompt = installEvent;
    notifyInstallAvailability();
  }) as EventListener);

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installedInSession = true;
    safeStorageSet(PWA_INSTALLED_MARKER_KEY, '1');
    notifyInstalled();
    notifyInstallAvailability();
  });

  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  standaloneQuery.addEventListener('change', () => {
    if (standaloneQuery.matches) installedInSession = true;
    notifyInstallAvailability();
  });
}

function watchInstallingWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.installing;
  if (!worker) return;

  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      notifyUpdateAvailable();
    }
  });
}

async function checkForUpdate() {
  if (!registrationRef || !navigator.onLine) return;
  try {
    await registrationRef.update();
    if (registrationRef.waiting && navigator.serviceWorker.controller) notifyUpdateAvailable();
  } catch {
    // Update checks are opportunistic. The current app remains usable if a check fails.
  }
}

export function registerPwaServiceWorker() {
  // Install-promotion event capture must start early even before React mounts.
  initializePwaInstallExperience();

  if (serviceWorkerInitialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  serviceWorkerInitialized = true;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      registrationRef = registration;

      if (registration.waiting && navigator.serviceWorker.controller) notifyUpdateAvailable();
      registration.addEventListener('updatefound', () => watchInstallingWorker(registration));

      window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
      window.addEventListener('online', () => void checkForUpdate());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
    } catch (error) {
      console.error('PWA service worker registration failed:', error);
    }
  }, { once: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadForUpdate) return;
    reloadForUpdate = false;
    window.location.reload();
  });
}

export function subscribeToPwaUpdate(listener: () => void) {
  window.addEventListener(UPDATE_EVENT, listener);
  return () => window.removeEventListener(UPDATE_EVENT, listener);
}

export function subscribeToPwaInstallAvailability(listener: () => void) {
  window.addEventListener(INSTALL_AVAILABILITY_EVENT, listener);
  return () => window.removeEventListener(INSTALL_AVAILABILITY_EVENT, listener);
}

export function subscribeToPwaInstalled(listener: () => void) {
  window.addEventListener(INSTALLED_EVENT, listener);
  return () => window.removeEventListener(INSTALLED_EVENT, listener);
}

export function applyPwaUpdate() {
  const waiting = registrationRef?.waiting;
  if (!waiting) {
    void checkForUpdate();
    return false;
  }

  reloadForUpdate = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
