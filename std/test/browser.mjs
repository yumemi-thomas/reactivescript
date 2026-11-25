// In Chromium: each call answers, stops when told to, and keeps nothing (listeners counted, what was given collected);
// the same of the packages of examples/rx-std under an owner that is disposed. In Node: every module loads, and `first`
// answers `otherwise`. Needs ref/'s Playwright and esbuild, and examples/rx-std built.
import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, "../.."), req = createRequire(path.join(repo, "ref/package.json"));
const { chromium } = req("playwright"), esbuild = req("esbuild"); let bad = 0;
const ok = (name, yes, more = "") => { if (!yes) bad++; console.log(`${yes ? "ok  " : "FAIL"} ${name} ${yes ? "" : more}`); };
const app = path.join(repo, "examples/rx-std");
for (const [m, n] of [["math", "max"], ["json", "parse"], ["object", "keys"], ["is", "isArray"], ["time", "after"], ["browser", "onWindow"], ["now", "first"]]) {
  const x = await import(path.join(app, `node_modules/@reactivescript/std/src/${m}.js`));
  ok(`server: ${m} loads`, typeof x[n] === "function");
  if (m === "now") ok("server: first answers otherwise, and does not read", x.first(() => { throw 0; }, 7) === 7);
}
const entry = `
import * as B from "@reactivescript/std/browser"; import * as T from "@reactivescript/std/time"; import * as N from "@reactivescript/std/now";
import { createRoot, createEffect, flush } from "solid-js";
import { createMediaQuery, createBreakpoints } from "@rx-primitives/media"; import { createElementSize, createWindowSize } from "@rx-primitives/resize-observer";
import { createPersisted } from "@rx-primitives/storage"; import { createPresence } from "@rx-primitives/presence"; import { createPolled, createTimeoutLoop } from "@rx-primitives/timer";
Object.assign(window, { B, T, N, createRoot, createEffect, flush, P: { createMediaQuery, createBreakpoints, createElementSize, createWindowSize, createPersisted, createPresence, createPolled, createTimeoutLoop } });`;
const out = await esbuild.build({ stdin: { contents: entry, resolveDir: app }, bundle: true, format: "iife", write: false, conditions: ["browser", "development"], logLevel: "error" });
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.route("http://x/", r => r.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })); await page.goto("http://x/");
  await page.evaluate(() => {
    window.live = new Map(); const key = (t, type) => `${t.constructor.name}:${type}`;
    for (const n of ["addEventListener", "removeEventListener"]) { const f = EventTarget.prototype[n]; EventTarget.prototype[n] = function (type, ...r) { if (!/own\.js/.test(new Error().stack)) { const f0 = f; return f0.call(this, type, ...r); } window.seen = (window.seen ?? 0) + 1; const k = key(this ?? window, type); live.set(k, (live.get(k) ?? 0) + (n[0] === "a" ? 1 : -1)); return f.call(this, type, ...r); }; }
    window.observers = 0; for (const n of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) { const C = window[n]; window[n] = class extends C { observe(...a) { const own = /own\.js/.test(new Error().stack); if (!own) return super.observe(...a); observers++; window.seen = (window.seen ?? 0) + 1; (window.where ??= []).push(n + " " + new Error().stack.split("\n")[2]); this.n = (this.n ?? 0) + 1; return super.observe(...a); } disconnect() { observers -= this.n ?? 0; this.n = 0; return super.disconnect(); } }; }
    window.timers = new Set(); for (const [a, c] of [["setInterval", "clearInterval"]]) { const f = window[a], g = window[c]; window[a] = (...x) => { const id = f(...x); timers.add(id); return id; }; window[c] = id => { timers.delete(id); g(id); }; }
  });
  await page.addScriptTag({ content: out.outputFiles[0].text + "\n//# sourceURL=own.js" });
  const wait = ms => page.waitForTimeout(ms);
  const r = await page.evaluate(async () => {
    const later = ms => new Promise(f => setTimeout(f, ms)), res = {}, el = document.body.appendChild(document.createElement("div")); el.style.width = "50px"; el.style.height = "10px";
    const go = async (name, make, fire, n = 1) => { let c = 0; const stop = make(() => { c++; }); await later(60); const c0 = c; await fire(); await later(80); const heard = c - (n ? c0 : 0); stop(); const before = c; await fire(); await later(80); res[name] = [heard > 0, c === before]; };
    await go("on", f => B.on(el, "x", f), () => el.dispatchEvent(new Event("x")));
    await go("onWindow", f => B.onWindow("resize", f), () => window.dispatchEvent(new Event("resize")));
    await go("onWindow, captured", f => B.onWindow("resize", f, true), () => window.dispatchEvent(new Event("resize")));
    await go("onDocument", f => B.onDocument("click", f), () => document.dispatchEvent(new Event("click")));
    await go("onVisible", f => B.onVisible(f), () => document.dispatchEvent(new Event("visibilitychange")));
    let w = 50; await go("onResize", f => B.onResize(el, f), () => { el.style.width = ++w + "px"; });
    await go("onMutation", f => B.onMutation(el, f, { childList: true }), () => { el.append("x"); });
    let m = 0; await go("onIntersect", f => B.onIntersect(el, f), () => { el.style.marginTop = (m = m ? 0 : 5000) + "px"; });
    el.style.marginTop = "0";
    await go("every", f => T.every(5, f), () => {});
    { let c = 0; T.after(5, () => c++); await later(40); const a = c; T.after(5, () => c++)(); await later(40); res.after = [a === 1, c === 1]; }
    { let c = 0; B.onFrame(() => c++); await later(80); const a = c; B.onFrame(() => c++)(); await later(80); res.onFrame = [a === 1, c === 1]; }
    { let c = 0; T.soon(() => c++); const sync = c; await 0; res.soon = [c === 1, sync === 0]; }
    res.reads = [N.isVisible() === true && N.windowSize().width === 800 && N.boxOf(el).height > 0 && N.matches("(min-width: 1px)") === true, N.first(() => 3, 7) === 3];
    return res;
  });
  for (const [k, [a, b]] of Object.entries(r)) { ok(`${k}: answers`, a); ok(`${k}: stops`, b); }
  { const heard = page.evaluate(() => new Promise(f => { const stop = B.onMedia("(max-width: 500px)", v => { stop(); f(v); }); })); await wait(50); await page.setViewportSize({ width: 400, height: 600 }); ok("onMedia: answers", await heard === true); await page.setViewportSize({ width: 800, height: 600 }); }
  const bal = await page.evaluate(() => [[...live].filter(([, n]) => n !== 0), observers, timers.size, window.where]);
  ok("every listener, observer and interval given back", !bal[0].length && bal[1] === 0 && bal[2] === 0, JSON.stringify(bal));
  ok("(the counts saw our calls)", await page.evaluate(() => window.seen) > 10);
  const held = n => page.evaluate(async N_ => {
    const refs = [];
    const one = () => { const el = document.createElement("div"), f = () => el; refs.push(new WeakRef(el)); [B.on(el, "x", f), B.onWindow("resize", f), B.onMedia("(min-width: 1px)", f), B.onResize(el, f), B.onIntersect(el, f), B.onMutation(el, f, { childList: true }), B.onFrame(f), T.after(1e6, f), T.every(1e6, f)].forEach(s => s()); };
    for (let i = 0; i < N_; i++) one();
    (function clear(n) { if (n) clear(n - 1); })(500);
    for (let i = 0; i < 12; i++) { await new Promise(f => setTimeout(f, 60)); gc(); } return refs.filter(r => r.deref()).length;
  }, n);
  const a50 = await held(50), alive = await held(200);
  ok("what was given is collected", a50 === 0 && alive === 0, `${a50} of 50, ${alive} of 200 alive`);
  // a set-up shared by all instances of a package (a module's page state, the runtime's app) is there after the first
  const round = () => page.evaluate(async () => {
    const el = document.body.appendChild(document.createElement("div")); const later = ms => new Promise(f => setTimeout(f, ms));
    const store = { getItem: () => null, setItem() {}, removeItem() {} };
    const dispose = createRoot(d => { const a = [P.createMediaQuery("(min-width: 1px)", false), P.createBreakpoints({ sm: "1px" }) && (() => 0), P.createPersisted("k", 1, store)[0]]; const s = P.createElementSize(() => el), w = P.createWindowSize(); const p = P.createPresence(() => "x", { transitionDuration: 5 }); const c = P.createPolled(n => (n ?? 0) + 1, () => 10, 0); P.createTimeoutLoop(() => {}, () => 10); for (const f of a) createEffect(f, () => {}); createEffect(() => [s.width, w.width, p.isMounted(), c()], () => {}); return d; });
    flush(); await later(60); dispose(); flush(); await later(60); el.remove(); return JSON.stringify([[...live].filter(([, n]) => n !== 0).sort(), observers, timers.size]);
  });
  const one = await round(), more = []; for (let i = 0; i < 4; i++) more.push(await round());
  ok("the packages give back what they took (five rounds)", more.every(x => x === one), `${one} … ${more.at(-1)}`); console.log("     after a round:", one);
} finally { await browser.close(); }
process.exit(bad ? 1 : 0);
