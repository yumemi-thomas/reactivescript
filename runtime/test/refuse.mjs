// A Solid that is not shaped as the runtime reads it is refused, by name, and never guessed around
// (ref/compile/solid-internals.ts): each case changes one thing Solid keeps, inside a plain render, and uses a package.
import mod from "./state.mjs";
import { library } from "@reactivescript/runtime";
import { renderToString } from "@solidjs/web";
import { getOwner, runWithOwner } from "solid-js";
const lib = library(mod, "t/state");
const ROOTS = Symbol.for("@solidjs/web/render-roots");
const cases = {
  // the table under another shape
  table: () => { globalThis[ROOTS] = {}; },
  // a table that names an owner which is not a render's root
  wrongRoot: () => { globalThis[ROOTS] = new WeakMap([[getOwner(), {}]]); },
  // owners with no `_parent`: the walk cannot leave the first one
  parent: () => { const o = getOwner(); return new Proxy(o, { has: (t, k) => k !== "_parent" && k in t, get: (t, k) => k === "_parent" ? undefined : t[k] }); },
};
const out = {};
for (const [name, change] of Object.entries(cases)) {
  const real = globalThis[ROOTS];
  try {
    renderToString(() => {
      let r;
      try { const fake = change(); r = fake ? runWithOwner(fake, () => lib.stamp()) : lib.stamp(); } catch (e) { r = "threw: " + e.message; } finally { globalThis[ROOTS] = real; }
      out[name] = r; return "";
    });
  } catch (e) { out[name] ??= "render threw: " + e.message; globalThis[ROOTS] = real; }
}
out.sound = renderToString(() => String(lib.stamp()));
console.log(JSON.stringify(out));
