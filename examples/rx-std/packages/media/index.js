// The package's API for JavaScript: what an .rx fn cannot say (optional parameters, a record of getters, a listener).
import { getOwner } from "solid-js";
import { isServer } from "@solidjs/web";
import * as core from "@rx-primitives/media/core";
import { dark } from "@rx-primitives/media/page";
export { createMediaQuery, createPrefersDark } from "@rx-primitives/media/core";

export const makeMediaQueryListener = (query, callback) => {
  if (isServer) return () => {};
  const list = typeof query === "string" ? window.matchMedia(query) : query;
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
};
/** On the server, outside a render: the page's own state is a render's there (MO-13g). */
export const usePrefersDark = () => (isServer && !getOwner() ? () => false : dark);
export function createBreakpoints(breakpoints, options = {}) {
  const { mediaFeature = "min-width", watchChange = true } = options;
  const names = Object.keys(breakpoints), queries = {}, fallback = options.fallbackState ?? {};
  for (const n of names) { queries[n] = `(${mediaFeature}: ${breakpoints[n]})`; if (!(n in fallback)) fallback[n] = false; }
  const read = core.createBreakpoints(queries, fallback, watchChange), matches = {};
  for (const n of names) Object.defineProperty(matches, n, { enumerable: true, get: () => read()[n] });
  return Object.defineProperty(matches, "key", { enumerable: false, get: () => names.findLast(n => matches[n]) });
}
export const sortBreakpoints = b => Object.fromEntries(Object.entries(b).sort((x, y) => parseInt(x[1], 10) - parseInt(y[1], 10)));
