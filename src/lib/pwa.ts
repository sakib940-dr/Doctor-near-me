const UPDATE_EVENT = 'docbd:pwa-update-available';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let registrationRef: ServiceWorkerRegistration | null = null;
let reloadForUpdate = false;
let initialized = false;

function notifyUpdateAvailable() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
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
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  initialized = true;

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
