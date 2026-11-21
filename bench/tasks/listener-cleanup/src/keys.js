// A keyboard shortcut helper, as an app's own JS has: subscribe, and get back the function that unsubscribes.
export let live = 0;
export function onShortcut(key, run) {
  const listener = e => { if (e.key === key) run(); };
  document.addEventListener("keydown", listener); live++;
  return () => { document.removeEventListener("keydown", listener); live--; };
}
export const liveListeners = () => live;
