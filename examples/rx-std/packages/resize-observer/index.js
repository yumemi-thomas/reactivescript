import { createEffect, getOwner, onCleanup } from "solid-js";
import { isServer } from "@solidjs/web";
import * as core from "@rx-primitives/resize-observer/core";
import { windowSize } from "@rx-primitives/resize-observer/page";
import { windowSize as now } from "@reactivescript/std/now";

const NONE = { width: null, height: null, clientWidth: null, clientHeight: null };
export const getWindowSize = () => (isServer ? { width: 0, height: 0 } : now());
export const getElementSize = el => {
  if (isServer || !el) return NONE;
  const { width, height } = el.getBoundingClientRect();
  return { width, height, clientWidth: el.clientWidth, clientHeight: el.clientHeight };
};
export function makeResizeObserver(callback, options) {
  if (isServer) return { observe() {}, unobserve() {} };
  const observer = new ResizeObserver(callback);
  onCleanup(() => observer.disconnect());
  return { observe: el => observer.observe(el, options), unobserve: el => observer.unobserve(el) };
}
// what it does is call the observer; nothing of it is state a .rx fn could hold (its callback gets the DOM's own entries)
export function createResizeObserver(targets, onResize, options) {
  if (isServer) return;
  const seen = new WeakMap();
  const { observe, unobserve } = makeResizeObserver(entries => {
    for (const entry of entries) {
      const width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height), was = seen.get(entry.target);
      if (!was || was.width !== width || was.height !== height) { onResize(entry.contentRect, entry.target, entry); seen.set(entry.target, { width, height }); }
    }
  }, options);
  let prev = [];
  createEffect(() => [(typeof targets === "function" ? targets() : targets)].flat().filter(x => x != null), els => {
    for (const el of prev) if (!els.includes(el)) unobserve(el);
    for (const el of els) if (!prev.includes(el)) observe(el);
    prev = els;
  }, { transparent: true });
}
const getters = (read, names) => names.reduce((o, n) => Object.defineProperty(o, n, { enumerable: true, get: () => read()[n] }), {});
const WINDOW = ["width", "height"];
export const createWindowSize = () => getters(core.createWindowSize(), WINDOW);
/** On the server, outside a render: the page's own state is a render's there (MO-13g). */
export const useWindowSize = () => isServer && !getOwner() ? { width: 0, height: 0 } : getters(windowSize, WINDOW);
export const createElementSize = target => getters(core.createElementSize(isServer ? null : target), ["width", "height", "clientWidth", "clientHeight"]);
