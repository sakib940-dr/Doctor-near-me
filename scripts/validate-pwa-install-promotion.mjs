import fs from 'node:fs';
import {
  isInstallPromotionDue,
  isIosSafariEnvironment,
  isStandaloneEnvironment,
  localCalendarDateKey,
  PWA_INSTALL_PROMPT_LAST_SHOWN_KEY,
} from '../src/lib/pwa.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

// 1-4: first visit, dismiss/reload same day, and next-day eligibility policy.
const morning = new Date(2026, 7, 20, 8, 15, 0);
const evening = new Date(2026, 7, 20, 22, 45, 0);
const nextDay = new Date(2026, 7, 21, 0, 5, 0);
expect(localCalendarDateKey(morning) === '2026-08-20', 'local calendar date key is incorrect');
expect(isInstallPromotionDue(null, morning), 'first visit today must be eligible');
expect(!isInstallPromotionDue(localCalendarDateKey(morning), evening), 'same-day reload must not be eligible');
expect(isInstallPromotionDue(localCalendarDateKey(morning), nextDay), 'next calendar day must become eligible');
expect(PWA_INSTALL_PROMPT_LAST_SHOWN_KEY === 'pwa_install_prompt_last_shown', 'daily storage key changed');

// 6 and 8: standalone and iOS Safari detection.
expect(isStandaloneEnvironment(true, false), 'display-mode standalone must count as installed');
expect(isStandaloneEnvironment(false, true), 'navigator.standalone must count as installed');
expect(!isStandaloneEnvironment(false, false), 'normal browser must not count as standalone');
const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1';
expect(isIosSafariEnvironment(iphoneSafari, 'iPhone', 5), 'iPhone Safari must use manual install instructions');
expect(!isIosSafariEnvironment(iphoneChrome, 'iPhone', 5), 'iPhone Chrome must not receive Safari-only instructions');
expect(isIosSafariEnvironment(iphoneSafari.replace('iPhone', 'Macintosh'), 'MacIntel', 5), 'iPad desktop UA mode must be detected');

const pwa = read('src/lib/pwa.ts');
const component = read('src/components/PwaInstallPromotion.tsx');
const app = read('src/App.tsx');
const css = read('src/styles.css');

// 5, 7 and 9: native Android/desktop prompt is deferred and only invoked after user action.
for (const token of ['beforeinstallprompt', 'preventDefault()', 'deferredInstallPrompt', 'promptEvent.prompt()', 'promptEvent.userChoice', 'appinstalled']) {
  expect(pwa.includes(token), `native install flow missing ${token}`);
}
expect(component.includes('onClick={() => void install()}'), 'native prompt must be user initiated');
expect(!component.includes('beforeinstallprompt'), 'component must reuse the shared PWA utility instead of duplicating event capture');

// iOS instructions, default Bangla/English localization, and Play Store wording.
for (const token of [
  'অ্যাপের মতো সহজে ব্যবহার করতে docbd.info ইনস্টল করুন',
  'ইনস্টল করুন',
  'এখন নয়',
  'Google Play অ্যাপ শীঘ্রই আসছে',
  'Safari-এর Share button চাপুন',
  '“Add to Home Screen” নির্বাচন করুন',
  'Add চাপুন',
  'Install docbd.info for easy app-like access',
  'Google Play app coming soon',
]) {
  expect(component.includes(token), `install promotion copy missing: ${token}`);
}

// StrictMode/reload safety: claim happens before the banner is made visible.
expect(component.indexOf('claimPwaInstallPromotionForToday()') < component.indexOf('setVisible(true)'), 'daily claim must happen before rendering the promotion');
expect(component.includes('SHOW_DELAY_MS = 2200'), 'promotion should not appear immediately at page load');

// 10: logged-in sessions are untouched; the global component does not depend on AuthContext/Supabase.
expect(!component.includes('AuthContext') && !component.includes('supabase') && !component.includes('signOut'), 'install promotion must not mutate authentication/session state');
expect(app.includes('<PwaInstallPromotion />'), 'global install promotion is not mounted');
expect(css.includes('bottom: calc(76px + env(safe-area-inset-bottom))'), 'mobile safe-area/bottom-navigation offset missing');
expect(css.includes('body.pwa-update-visible .pwa-install-promotion { display: none; }'), 'update/install prompt overlap guard missing');
expect(css.includes('@media (display-mode: standalone)'), 'standalone CSS suppression missing');

console.log('PWA install promotion validation passed: daily policy, standalone/iOS detection, native prompt wiring, localization, safe-area UX, and auth isolation.');
