/**
 * Home-screen apps on iPhone are resumed, not reopened, so the service worker rarely checks for a
 * new version on its own. Check whenever the app comes back to the foreground (and hourly), and
 * switch to the new version as soon as it is installed — unless a dialog is open, in which case
 * wait until the app is next put in the background so nothing being typed is lost.
 */
export function keepUpToDate() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let controller = sw.controller; // the very first install also fires controllerchange: ignore that one
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    const reg = await sw.getRegistration().catch(() => undefined);
    await reg?.update().catch(() => {});
  };
  let pending = false;
  const busy = () => !!document.querySelector('[role="dialog"]');
  sw.addEventListener('controllerchange', () => {
    const first = !controller;
    controller = sw.controller;
    if (first || pending) return;
    pending = true;
    if (!busy()) window.location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
    else if (pending) window.location.reload();
  });
  window.addEventListener('focus', check);
  setInterval(check, 60 * 60 * 1000);
}
