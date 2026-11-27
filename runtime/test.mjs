// The built package as an app takes it (after `npm run build`, and the compiler's Node-API build in ../compiler): the
// browser build (the `browser` condition) and the server build (`node`) export the runtime, and a program compiled
// for ssr by the crate renders on the server build over the Solid it is installed with (the pin, ../../solid-next, as ref/).
// Usage: node test.mjs
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, ".test"); rmSync(tmp, { recursive: true, force: true }); mkdirSync(path.join(tmp, "node_modules/@reactivescript"), { recursive: true });
// RX_SOLID_FROM=<a node_modules folder>: the Solid an app installed from npm — the release the package's peer range
// starts at (runtime/.npm204, `scripts/ci` runtime-npm) — in place of the pin. The package is then copied in as npm
// installs it, so that its own imports of Solid resolve to that one and not to this folder's devDependencies.
const solidFrom = process.env.RX_SOLID_FROM ? path.resolve(process.env.RX_SOLID_FROM) : path.join(here, "node_modules");
if (process.env.RX_SOLID_FROM) { const to = path.join(tmp, "node_modules/@reactivescript/runtime"); mkdirSync(to); cpSync(path.join(here, "package.json"), path.join(to, "package.json")); cpSync(path.join(here, "dist"), path.join(to, "dist"), { recursive: true }); console.log(`Solid ${JSON.parse(readFileSync(path.join(solidFrom, "solid-js/package.json"), "utf8")).version}, from ${solidFrom}`); }
else symlinkSync(here, path.join(tmp, "node_modules/@reactivescript/runtime"));
// Solid is linked from the pin (../../solid-next), as ref/'s is; seroval, which a test reads as Solid's server does, is
// the one @solidjs/web is installed with
for (const d of ["solid-js", "@solidjs"]) symlinkSync(path.join(solidFrom, d), path.join(tmp, "node_modules", d));
for (const d of ["seroval", "seroval-plugins"]) symlinkSync(existsSync(path.join(solidFrom, d)) ? path.join(solidFrom, d) : realpathSync(path.join(realpathSync(path.join(solidFrom, "@solidjs/web")), "node_modules", d)), path.join(tmp, "node_modules", d));
let fail = 0;
const check = (name, ok, detail = "") => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`); };
try {
  const probe = `import("@reactivescript/runtime").then(m => console.log(Object.keys(m).sort().join(",")))`;
  for (const [cond, build] of [["browser", "web"], ["node", "server"]]) {
    const keys = execFileSync(process.execPath, ["--conditions=" + cond, "--input-type=module", "-e", probe], { cwd: tmp }).toString().trim();
    check(`${build} build (${cond})`, keys.includes("createApp"), keys);
  }
  const { app: compile } = createRequire(import.meta.url)("../compiler/index.js");
  const out = JSON.parse(compile(path.resolve(here, "../examples/todo.rx"), "ssr"));
  writeFileSync(path.join(tmp, "todo.mjs"), Object.values(out.modules)[0].code);
  writeFileSync(path.join(tmp, "ssr.mjs"), `import main from "./todo.mjs";\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp(); let html = "";\napp.stream(main(app), { write: s => { html += s; }, end: () => console.log(html) });\n`);
  const html = execFileSync(process.execPath, ["ssr.mjs"], { cwd: tmp }).toString();
  check("todo.rx rendered on the server build", /<main _hk=[^>]*>.*0<!--\/--> left/.test(html), html.slice(0, 120));
  // MO-8c, CP-4c: `./api` in an app given no `api` — a development build says so at the first call, once an import, on both
  // builds; a production build, a runner (`conformance`) and an app that has an `api` say nothing. `log` prints there too.
  // Only `./api` is the app's: `../api` and `./lib/api` are files. A `./api.js` beside the program does not change it.
  mkdirSync(path.join(tmp, "in/lib"), { recursive: true });
  for (const f of ["api.js", "in/api.js", "in/lib/api.js"]) writeFileSync(path.join(tmp, f), `export const load = async () => "file";\nexport const up = () => "up";\nexport const deep = () => "deep";\n`);
  writeFileSync(path.join(tmp, "in/asks.rx"), `import pure { load } from "./api"\nimport pure { up } from "../api"\nimport pure { deep } from "./lib/api"\nexport default component App() {\n  a = await load("x")\n  <b onClick={() => { log(1, "two") }}>{up()} {deep()}</b>\n  errored fallback(e) { <p>e</p> } { loading fallback { <p>w</p> } { <p>{a}</p> } }\n}\n`);
  const asks = Object.values(JSON.parse(compile(path.join(tmp, "in/asks.rx"), "ssr")).modules)[0].code;
  check("only ./api is the app's injected API; ../api and ./lib/api are imported (MO-8c)", /from "\.\.\/api"/.test(asks) && /from "\.\/lib\/api"/.test(asks) && !/from "\.\/api"/.test(asks) && /__rt\.api\("load"\)/.test(asks), asks.slice(0, 300));
  const silent = `import { createApp } from "@reactivescript/runtime";\nfor (const o of [{}, {}, { conformance: true }, { api: { load: async () => "given" } }]) { const a = createApp({ root: null, ...o }); if (o.conformance || o.api) console.error("--"); a.api("load")("x"); a.api("load")("y"); a.B.log(1, "two"); }\n`;
  for (const [conds, dev] of [[["browser", "development"], true], [["node", "development"], true], [["browser"], false], [["node"], false]]) {
    const r = spawnSync(process.execPath, [...conds.map(c => "--conditions=" + c), "--input-type=module", "-e", silent], { cwd: tmp, encoding: "utf8" });
    const [first, ...rest] = r.stderr.split("--\n"); const once = (first.match(/load\(…\), imported from "\.\/api", will never answer/g) ?? []).length;
    check(`./api with no createApp({ api }), and log (${conds}): ${dev ? "said once, with the two ways out, and printed" : "silent"}`, once === (dev ? 1 : 0) && (!dev || /createApp\(\{ api: \{ load \} \}\)/.test(first) && /"\.\/api\.js" for one/.test(first)) && rest.length === 2 && !rest.join("").trim() && r.stdout === (dev ? "1 two\n".repeat(3) : ""), (r.stdout + r.stderr).slice(0, 400));
  }
  // AC-3: a guess over a list that is written too (Solid's server ran a projection over a pending store at once until
  // 2.0.4, solidjs/solid#5097, and the runtime rendered the truth around it): the page waits and renders the list
  writeFileSync(path.join(tmp, "rows.mjs"), `export const load = async () => { await new Promise(r => setTimeout(r, 5)); return [{ id: 1, t: "A" }, { id: 2, t: "B" }]; };\nexport const save = async t => t;\n`);
  writeFileSync(path.join(tmp, "guess.rx"), `import pure { load } from "./rows.mjs"\nimport { save } from "./rows.mjs"\nexport default component App() {\n  source rows key id = await load()\n  action rename(t: string) {\n    guess rows[0].t := t\n    try { await save(t); rows[0].t := t } catch (e) { refresh rows }\n  }\n  errored fallback(e) { <p>{e.message}</p> } { loading fallback { <p>w</p> } { <ul>{for r in rows { <li>{r.t}</li> }}</ul> } }\n  <button onClick={() => { rename("x") }}>a</button>\n}\n`);
  writeFileSync(path.join(tmp, "guess.mjs"), Object.values(JSON.parse(compile(path.join(tmp, "guess.rx"), "ssr")).modules)[0].code);
  const guessed = spawnSync(process.execPath, ["--input-type=module", "-e", `import main from "./guess.mjs";\nimport { createApp } from "@reactivescript/runtime";\nconst app = createApp(); let html = "";\napp.stream(main(app), { write: s => { html += s; }, end: () => console.log(html) });\n`], { cwd: tmp, encoding: "utf8" });
  check("a guess over a list that is written too, rendered on the server (AC-3)", /<li[^>]*>A<\/li><li[^>]*>B<\/li>/.test(guessed.stdout), (guessed.stderr || guessed.stdout).slice(0, 200));
  // the server warns, once, when a stream's first chunk has markup and no hydration key: the compiled modules render
  // with another copy of Solid than the runtime (a bundler inlined one). Two requests each way: with the one copy
  // nothing is said; with the compiled module on its own solid-js and @solidjs/web the page has no keys, and the
  // warning comes once. A second @solidjs/web alone, over the same solid-js, still keys: it is solid-js's copy that counts.
  const twice = `import main from "./todo.mjs";\nimport { createApp } from "@reactivescript/runtime";\nfor (let i = 0; i < 2; i++) { const app = createApp(); let html = ""; app.stream(main(app), { write: s => { html += s; }, end: () => console.log(/_hk=/.test(html) ? "keyed" : "unkeyed") }); }\n`;
  const warnings = r => (r.stderr.match(/\[reactivescript\] the server's first chunk has markup but no hydration keys/g) ?? []).length;
  writeFileSync(path.join(tmp, "twice.mjs"), twice);
  const one = spawnSync(process.execPath, ["twice.mjs"], { cwd: tmp, encoding: "utf8" });
  check("one copy of Solid: the stream is keyed and nothing is warned", one.stdout.trim() === "keyed\nkeyed" && warnings(one) === 0, one.stdout + one.stderr);
  for (const [name, copied, keyed, warned] of [["a second @solidjs/web over the same solid-js still keys: no warning", ["@solidjs/web"], "keyed\nkeyed", 0], ["a second copy of Solid: no keys, and the warning once for the process", ["@solidjs/web", "solid-js"], "unkeyed\nunkeyed", 1]]) {
    const dup = path.join(tmp, "dup"); rmSync(dup, { recursive: true, force: true }); mkdirSync(path.join(dup, "node_modules/@solidjs"), { recursive: true });
    // a copy of the package's own files; what it imports, other than the copies, from where the original finds it (the
    // pin's packages are a pnpm workspace: their node_modules link one another, so they are not copied)
    for (const d of copied) {
      const from = realpathSync(path.join(here, "node_modules", d)), to = path.join(dup, "node_modules", d);
      cpSync(from, to, { recursive: true, filter: src => !path.relative(from, src).split(path.sep).includes("node_modules") });
      const deps = path.join(from, "node_modules");
      if (existsSync(deps)) for (const n of readdirSync(deps).flatMap(n => n.startsWith("@") ? readdirSync(path.join(deps, n)).map(m => `${n}/${m}`) : [n])) {
        if (n.startsWith(".") || copied.includes(n)) continue;
        mkdirSync(path.dirname(path.join(to, "node_modules", n)), { recursive: true }); symlinkSync(realpathSync(path.join(deps, n)), path.join(to, "node_modules", n));
      }
    }
    writeFileSync(path.join(dup, "todo.mjs"), Object.values(out.modules)[0].code); writeFileSync(path.join(dup, "twice.mjs"), twice);
    const r = spawnSync(process.execPath, ["twice.mjs"], { cwd: dup, encoding: "utf8" });
    check(name, r.stdout.trim() === keyed && warnings(r) === warned && (!warned || (/different copies \(solid-js/.test(r.stderr) && /may not be able to hydrate/.test(r.stderr))), (r.stdout + r.stderr).slice(0, 300));
  }
  // CP-4d, MO-13g: a ?rx-lib component rendered on the server where nothing renders and no request is answered throws,
  // unless the host passes the app; inside any Solid render it is that render's
  writeFileSync(path.join(tmp, "lib.rx"), "export component Hello() {\n  <b>hi</b>\n}\n");
  const lib = JSON.parse(compile(path.join(tmp, "lib.rx"), "ssr", "@solidjs/web", false, true));
  writeFileSync(path.join(tmp, "lib.mjs"), lib.modules[Object.keys(lib.modules).find(k => k.endsWith("lib.rx"))].code);
  writeFileSync(path.join(tmp, "host.mjs"), `import pages from "./lib.mjs";\nimport { components, createApp } from "@reactivescript/runtime";\nlet threw = "";\ntry { components(pages).Hello({}); } catch (e) { threw = String(e.message); }\nlet ok = true;\ntry { components(pages, createApp()).Hello({}); } catch (e) { ok = String(e.message); }\nconsole.log(JSON.stringify({ threw, ok }));\n`);
  const host = JSON.parse(execFileSync(process.execPath, ["host.mjs"], { cwd: tmp }).toString());
  check("a ?rx-lib component used on the server outside a render and outside a request throws, and says what to do (CP-4d)", /outside a render and outside a request/.test(host.threw) && /renderToString/.test(host.threw) && /provideRequestEvent/.test(host.threw) && /components\(pages, createApp/.test(host.threw), host.threw);
  check("the same with the app passed renders", host.ok === true, String(host.ok));
  // CP-4b: a factory the dev server's plugin named is keyed by its name — the same file with the same text, evaluated
  // twice (a dev server serves one module under several URLs), is one instance; an edited one, or one with no name, its own
  writeFileSync(path.join(tmp, "keyed.mjs"), `import { createApp } from "@reactivescript/runtime";\nconst app = createApp({ root: null });\nconst f = () => () => ({});\nconst a = f(), b = f(), c = f(), d = f(); a.__rxKey = b.__rxKey = "src/team.rx#1"; c.__rxKey = "src/team.rx#2";\nconsole.log(JSON.stringify({ same: app.module(a, a) === app.module(b, b), edited: app.module(c, c) !== app.module(a, a), unnamed: app.module(d, d) !== app.module(a, a) && app.module(d, d) === app.module(d, d) }));\n`);
  const keyedOut = execFileSync(process.execPath, ["--conditions=browser", "keyed.mjs"], { cwd: tmp }).toString().trim();
  check("a module the dev server served twice is one instance: keyed by its name, not by its factory (CP-4b)", keyedOut === JSON.stringify({ same: true, edited: true, unnamed: true }), keyedOut);
  writeFileSync(path.join(tmp, "host2.mjs"), `import pages from "./lib.mjs";\nimport { components, library } from "@reactivescript/runtime";\nimport { renderToString } from "@solidjs/web";\nconst out = {};\ntry { out.components = renderToString(() => components(pages).Hello({})); out.library = renderToString(() => library(pages, "t/lib").Hello({})); } catch (e) { out.threw = String(e.message); }\nconsole.log(JSON.stringify(out));\n`);
  const host2 = spawnSync(process.execPath, ["host2.mjs"], { cwd: tmp, encoding: "utf8" });
  const plainRender = JSON.parse(host2.stdout.trim().split("\n").pop() || "{}");
  check("inside a plain renderToString, with no request event, both render (MO-13g) and Solid warns of no missing event", /hi/.test(plainRender.components ?? "") && /hi/.test(plainRender.library ?? "") && !/RequestEvent is missing/.test(host2.stderr + host2.stdout), JSON.stringify(plainRender) + host2.stderr.slice(0, 300));
  // MO-13g, MO-13h, in the browser's build: a module JavaScript uses is instantiated in a root no owner holds — it
  // outlives the owner that first read it — in the page's app, which is the app of the .rx program that starts after
  writeFileSync(path.join(tmp, "state.rx"), "export source n: number := 1\nexport doubled = n * 2\nexport action bump() { n := n => n + 1 }\n");
  const st = JSON.parse(compile(path.join(tmp, "state.rx"), "dom", "@solidjs/web", false, true));
  writeFileSync(path.join(tmp, "state.mjs"), st.modules[Object.keys(st.modules).find(k => k.endsWith("state.rx"))].code);
  writeFileSync(path.join(tmp, "page.mjs"), `import mod from "./state.mjs";
import { library, createApp } from "@reactivescript/runtime";
import { createRoot, createEffect, flush } from "solid-js";
const lib = library(mod, "t/state"); const seen = [];
createRoot(dispose => { lib.doubled(); dispose(); });                 // the first reader, gone at once
createRoot(() => { createEffect(() => lib.doubled(), v => { seen.push(v); }); });
flush(); await lib.bump(); flush();
const app = createApp({ root: null });                                // an .rx program starts: the page's app
const second = createApp({ root: null });
console.log(JSON.stringify({ seen, program: app.module(mod, mod).n(), second: second !== app && second.module(mod, mod).n() }));
`);
  const pageOut = spawnSync(process.execPath, ["--conditions=browser", "page.mjs"], { cwd: tmp, encoding: "utf8" });
  let pg = {}; try { pg = JSON.parse(pageOut.stdout.trim().split("\n").pop()); } catch { pg = { error: pageOut.stdout + pageOut.stderr }; }
  check("a module JavaScript uses outlives the owner that first read it (MO-13h)", JSON.stringify(pg.seen) === "[2,4]", JSON.stringify(pg));
  check("the .rx program that starts in the page has the instance JavaScript used; a second app has its own (MO-13g)", pg.program === 2 && pg.second === 1, JSON.stringify(pg));
  // MO-13i: what a fn answers is handed to JavaScript in parts: what they are, when they follow, who owns them, and that
  // `.rx` has the accessor it had. MO-13g: on the server, outside a render, where the module holds no state
  writeFileSync(path.join(tmp, "parts.rx"), `export fn createPager(ref pages: number, first: any) {
  source raw := first
  page = raw > pages ? pages : raw
  action set(n: number) { raw := n }
  { page: page, double: page * 2, set: set, first: first, of: (n: number) => n + pages }
}
export fn handOn(ref pages: number) {
  p = createPager(pages, 1)
  [p.page, p.set, p]
}
export fn useOnce(ref x: any) { y = x  y }
export fn nothing(ref x: any) { effect (x) {}  null }
export fn go() { source s := 1  action run() { s := 2 }  run }
`);
  const pa = JSON.parse(compile(path.join(tmp, "parts.rx"), "dom", "@solidjs/web", false, true)), paSsr = JSON.parse(compile(path.join(tmp, "parts.rx"), "ssr", "@solidjs/web", false, true));
  for (const [j, f] of [[pa, "parts.mjs"], [paSsr, "parts.ssr.mjs"]]) writeFileSync(path.join(tmp, f), Object.values(j.modules)[0].code);
  writeFileSync(path.join(tmp, "parts-page.mjs"), `import mod from "./parts.mjs";
import { primitives, createApp } from "@reactivescript/runtime";
import { createRoot, createSignal, createEffect, flush, getOwner } from "solid-js";
const lib = primitives(mod, "t/parts", { createPager: [0], handOn: [0], useOnce: [0], nothing: [0], go: [] }, true);
const out = {}; const seen = []; let dispose, owned;
const [pages, setPages] = createSignal(5);
createRoot(d => { dispose = d; const before = getOwner();
  const p = lib.createPager(pages, 3), q = lib.createPager(4), [at, set, whole] = lib.handOn(pages);
  out.kinds = [typeof p.page, typeof p.double, typeof p.set, p.first, p.of(1), Object.keys(p).join()];
  out.left = q.page() === undefined && q.first === undefined;        // an argument left out is undefined
  out.handed = [at(), whole.page(), whole.set === set, whole.first];
  out.one = [lib.useOnce(7)(), lib.useOnce(() => 8)(), lib.useOnce()()]; out.nothing = lib.nothing(1); out.act = typeof lib.go();
  createEffect(() => [p.page(), p.double()].join(), v => { seen.push(v); });
  Object.assign(out, { p, set, at });
});
flush(); const { p, set, at } = out; delete out.p; delete out.set; delete out.at;
out.answer = p.set(9) instanceof Promise; await 0; flush(); setPages(4); flush(); await set(2); flush();
out.seen = seen; out.at = at();
dispose(); p.set(1); await 0; flush(); out.after = seen.length;
const rx = createApp({ root: null }).module(mod, mod);               // .rx: the accessor of the whole, as it was
createRoot(() => { const w = rx.createPager(() => 2, 1); out.rx = [typeof w, w().page, w().double, typeof w().set]; });
let old = ""; try { mod({}); } catch (e) { old = e.message; } out.old = /parts\\.rx: .*upgrade it in the app/.test(old);
console.log(JSON.stringify(out));
`);
  const partsOut = spawnSync(process.execPath, ["--conditions=browser", "--conditions=development", "parts-page.mjs"], { cwd: tmp, encoding: "utf8" });
  let pt = {}; try { pt = JSON.parse(partsOut.stdout.trim().split("\n").pop()); } catch { pt = { error: partsOut.stdout + partsOut.stderr }; }
  check("a fn's parts, for JavaScript: accessors, the action, the value, a closure (MO-13i)", JSON.stringify(pt.kinds) === '["function","function","function",3,6,"page,double,set,first,of"]' && pt.left === true && pt.nothing === null && pt.act === "function" && pt.answer === true, JSON.stringify(pt));
  check("a part follows what it reads and the action that writes it; parts handed on from another fn's call too", JSON.stringify(pt.seen) === '["3,6","5,10","4,8"]' && pt.at === 2 && JSON.stringify(pt.handed) === '[1,1,true,1]', JSON.stringify(pt));
  check("a `ref` parameter takes an accessor or the value, and one left out is undefined", JSON.stringify(pt.one) === "[7,8,null]", JSON.stringify(pt));
  check("the parts are disposed with the owner that called the fn", pt.after === 3, JSON.stringify(pt));
  check("`.rx` has the accessor of the whole, and a runtime with no parts is refused by name", JSON.stringify(pt.rx) === '["function",1,2,"function"]' && pt.old === true, JSON.stringify(pt));
  check("...with nothing said by Solid's development build", partsOut.stderr === "", partsOut.stderr.slice(0, 400));
  writeFileSync(path.join(tmp, "parts-server.mjs"), `import mod from "./parts.ssr.mjs";
import { primitives } from "@reactivescript/runtime";
import { renderToString } from "@solidjs/web";
const refs = { createPager: [0] }, lib = primitives(mod, "t/parts", refs, true), held = primitives(mod, "t/held", refs, false);
const a = lib.createPager(5, 2), b = lib.createPager(() => 1, 2); const out = { a: [a.page(), a.double(), a.of(1)], b: b.page() };
try { held.createPager(5, 2); out.held = "answered"; } catch (e) { out.held = /outside a render and outside a request/.test(e.message); }
out.render = renderToString(() => String(lib.createPager(5, 2).page()));
console.log(JSON.stringify(out));
`);
  const serverParts = spawnSync(process.execPath, ["parts-server.mjs"], { cwd: tmp, encoding: "utf8" });
  let sp = {}; try { sp = JSON.parse(serverParts.stdout.trim().split("\n").pop()); } catch { sp = { error: serverParts.stdout + serverParts.stderr }; }
  check("on the server, outside a render: a fn of a module that holds no state answers, each call its own; another's throws (MO-13g)", JSON.stringify(sp) === '{"a":[2,4,6],"b":1,"held":true,"render":"2"}' && serverParts.stderr === "", JSON.stringify(sp) + serverParts.stderr);
  // Solid's contract: what the runtime reads of Solid that Solid does not publish (ref/compile/solid-internals.ts), held
  // against the installed Solid alone. A Solid bump that moves one of them fails here, by name, before anything is
  // scoped wrongly
  const fx = path.join(tmp, "request"); cpSync(path.join(here, "test"), fx, { recursive: true });
  const contractRun = spawnSync(process.execPath, ["contract.mjs"], { cwd: fx, encoding: "utf8" });
  let contract = {}; try { contract = JSON.parse(contractRun.stdout.trim().split("\n").pop()); } catch { contract = { "contract.mjs ran": false }; }
  const solidIs = createRequire(import.meta.url)("solid-js/package.json").version;
  for (const [fact, holds] of Object.entries(contract)) check(`Solid's contract, solid-js ${solidIs}: ${fact}`, holds === true, holds === true ? "" : (contractRun.stderr || "").slice(0, 300));
  check("Solid's contract was read", Object.keys(contract).length >= 16, contractRun.stdout.slice(0, 200) + contractRun.stderr.slice(0, 300));
  // the same against the Solid ref/ runs on (ref/SOLID_NEXT, built beside the repository or at $SOLID_NEXT), where there is one:
  // the pin moves before a release does
  const pinAt = process.env.SOLID_NEXT ?? path.resolve(here, "../../solid-next");
  if (existsSync(path.join(pinAt, "packages/web/dist/server.js"))) {
    const pin = path.join(tmp, "pin"); mkdirSync(path.join(pin, "node_modules/@solidjs"), { recursive: true });
    for (const [name, dir] of [["solid-js", "solid"], ["@solidjs/web", "web"], ["@solidjs/signals", "signals"]]) symlinkSync(path.join(pinAt, "packages", dir), path.join(pin, "node_modules", name));
    cpSync(path.join(here, "test/contract.mjs"), path.join(pin, "contract.mjs"));
    const pinRun = spawnSync(process.execPath, ["contract.mjs"], { cwd: pin, encoding: "utf8" });
    let pinned = {}; try { pinned = JSON.parse(pinRun.stdout.trim().split("\n").pop()); } catch { /* reported below */ }
    const broken = Object.entries(pinned).filter(([, holds]) => holds !== true).map(([fact]) => fact);
    check(`Solid's contract holds on the pinned Solid too (solid-js ${JSON.parse(readFileSync(path.join(pinAt, "packages/solid/package.json"), "utf8")).version}, ${pinAt})`, Object.keys(pinned).length === Object.keys(contract).length && broken.length === 0, broken.join("; ") + pinRun.stderr.slice(0, 300));
  } else console.log(`- Solid's contract on the pinned Solid: no build at ${pinAt} (set SOLID_NEXT)`);
  // ...and a Solid shaped otherwise is refused where it is read, naming the version and what is missing; no fallback
  const rq = JSON.parse(compile(path.join(fx, "state.rx"), "ssr", "@solidjs/web", false, true));
  writeFileSync(path.join(fx, "state.mjs"), rq.modules[Object.keys(rq.modules).find(k => k.endsWith("state.rx"))].code);
  const refuseRun = spawnSync(process.execPath, ["refuse.mjs"], { cwd: fx, encoding: "utf8" });
  let refused = {}; try { refused = JSON.parse(refuseRun.stdout.trim().split("\n").pop()); } catch { refused = { error: refuseRun.stdout + refuseRun.stderr }; }
  const says = (r, what) => typeof r === "string" && r.includes(`solid-js ${solidIs} is not shaped as @reactivescript/runtime reads it: ${what}`) && /does not guess/.test(r);
  check("a table of render roots under another shape is refused, naming Solid's version", says(refused.table, "globalThis[Symbol.for(\"@solidjs/web/render-roots\")] is not a WeakMap"), String(refused.table ?? refused.error).slice(0, 200));
  check("a table that names an owner which is not the render's root is refused", says(refused.wrongRoot, "the table of render roots names a render that getHydrationWriter() does not find"), String(refused.wrongRoot).slice(0, 200));
  check("an owner with no `_parent` is refused", says(refused.parent, "an owner has no `_parent` field"), String(refused.parent).slice(0, 200));
  check("...and the same render with Solid as it is reads its instance", /^\d+$/.test(refused.sound ?? ""), String(refused.sound));
  // MO-13g: in a request event a package's state lives as the request does. Its renders hold it; it is released (its
  // module's root disposed) when a turn of the event loop passes with none open; a later render is refused
  const reqRun = spawnSync(process.execPath, ["--expose-gc", "request.mjs"], { cwd: fx, encoding: "utf8" });
  let rs = {}; try { rs = JSON.parse(reqRun.stdout.trim().split("\n").pop()); } catch { rs = { error: reqRun.stdout + reqRun.stderr }; }
  const j = v => JSON.stringify(v) ?? String(rs.error).slice(0, 400);
  const sq = rs.sequential ?? {}, ov = rs.overlapping ?? {}, gap = rs.gap ?? {}, held = rs.held ?? {};
  check("two renders one after the other in one request event read one live instance (MO-13g)", sq.a === 1 && sq.b === 1 && j(sq.between) === "[]" && j(sq.before) === "[]", j(sq));
  check("...released after the request: its module's root is disposed once a turn passes with no render open", j(sq.after) === "[1]", j(sq));
  check("...and a render that begins after that is refused, saying why and what to do; so is a hold", /^threw: Show, an export of the compiled \.rx module t\/state, was used in a request whose state has been released/.test(sq.late) && /holdRequest\(\)/.test(sq.late) && /^threw: holdRequest\(\) was used in a request whose state has been released/.test(sq.lateHold), j([sq.late, sq.lateHold]));
  check("two renders open at once: the render that instantiated the module ends first, and the other still reads it live, to its end", ov.first === ov.second && ov.during === ov.first && ov.lateRead === true && ov.whileOpen === 0 && ov.atEnd === 0, j(ov));
  check("...released when the last of them has ended", ov.after === 1 && ov.last === ov.first, j(ov));
  check("a render after an await, with nothing open meanwhile, is refused rather than read disposed state", /^threw: .*state has been released/.test(gap.b) && gap.disposed === gap.a, j(gap));
  check("holdRequest() keeps the request's state across the gap, until its release (called twice: once)", held.a === held.b && held.whileHeld === true && held.after === held.a, j(held));
  check("two requests at once have an instance each, and each one's renders read its own", j(rs.concurrent) === "[[5,5],[6,6]]", j(rs.concurrent));
  check("a request that renders nothing has one instance too; holdRequest() outside a request says so", rs.noRender?.stamp === 7 && rs.noRender?.again === 7 && /outside a request/.test(rs.outside ?? ""), j([rs.noRender, rs.outside]));
  check("every instance a render held was disposed, and no request's event is kept after it (gc)", rs.made === 7 && rs.allDisposed === 6 && rs.kept === 0, j([rs.made, rs.allDisposed, rs.kept]));
  // SV-5a: a declared JS error class's instance is stamped with the nearest declared class up its prototype chain, whatever
  // order the program registered them in; it arrives through Solid's serializer, and a client boundary typed with the
  // class, or a base class, gives it back its own class
  writeFileSync(path.join(tmp, "classes.mjs"), `import { createApp } from "@reactivescript/runtime";
import { serialize, deserialize } from "seroval";
class Base extends Error {} class Child extends Base {} class Grand extends Child {}
const stamp = (order, err) => { const app = createApp({}); for (const [C, id, fields] of order) app.jsClass(C, id, fields); const sent = app.markSendable(err); return { sent: !!sent, cls: sent?.$class, all: sent?.$classes, isChild: sent instanceof Child, untouched: err.$class === undefined }; };
const B = [Base, "k.d.rx#Base"], C = [Child, "k.d.rx#Child"];
// what Solid would serialize: the copy, with only the declared fields, and none of what the library attached
const leaky = Object.assign(new Child("not found", { cause: new Error("db password=hunter2") }), { status: 404, response: { headers: { authorization: "Bearer x" } } });
const app = createApp({}); app.jsClass(Base, "k.d.rx#Base", ["status"]); app.jsClass(Child, "k.d.rx#Child");
const text = serialize(app.markSendable(leaky));
const back = deserialize(text);
// a declared field an instance came without: a required one is said once on the server, an optional one (\`code?\`) is not
const warned = []; const warn = console.warn; console.warn = (...a) => { warned.push(a.join(" ")); };
const fielded = createApp({}); fielded.jsClass(Base, "k.d.rx#Base", ["status", "code?"]);
const bare = fielded.markSendable(new Base("no status")); fielded.markSendable(new Base("again"));
const full = fielded.markSendable(Object.assign(new Base("both"), { status: 500, code: "E" }));
console.warn = warn;
console.log(JSON.stringify({ missing: { warned, sent: bare.$class, status: "status" in bare, code: "code" in bare, full: [full.status, full.code] }, baseFirst: stamp([B, C], new Child("c")), childFirst: stamp([C, B], new Child("c")), baseOnly: stamp([B], new Child("c")), grand: stamp([B, C], new Grand("g")), plain: stamp([B, C], new Error("p")),
  wire: { cls: back.$class, all: back.$classes, message: back.message, status: back.status, leaked: /hunter2|authorization|Bearer|stack/.test(text) } }));
`);
  const cls = JSON.parse(execFileSync(process.execPath, ["classes.mjs"], { cwd: tmp }).toString());
  const both = ["k.d.rx#Child", "k.d.rx#Base"];
  check("a subclass is sent as its own declared class, its base registered first (SV-5a)", cls.baseFirst.cls === "k.d.rx#Child" && JSON.stringify(cls.baseFirst.all) === JSON.stringify(both), JSON.stringify(cls.baseFirst));
  check("what is sent is a copy, of the instance's class; the library's instance is left as it was", cls.baseFirst.isChild && cls.baseFirst.untouched, JSON.stringify(cls.baseFirst));
  check("...and registered second", cls.childFirst.cls === "k.d.rx#Child" && JSON.stringify(cls.childFirst.all) === JSON.stringify(both), JSON.stringify(cls.childFirst));
  check("a subclass with only its base declared is stamped with the base", cls.baseOnly.sent && cls.baseOnly.cls === "k.d.rx#Base" && cls.baseOnly.all === undefined, JSON.stringify(cls.baseOnly));
  check("an undeclared subclass of a declared class is stamped with the nearest declared one", cls.grand.cls === "k.d.rx#Child", JSON.stringify(cls.grand));
  check("an undeclared class is not sent", cls.plain.sent === false && cls.plain.cls === undefined, JSON.stringify(cls.plain));
  check("the stamps survive Solid's serializer", cls.wire.cls === "k.d.rx#Child" && JSON.stringify(cls.wire.all) === JSON.stringify(both), JSON.stringify(cls.wire));
  check("only the message and the declared fields cross: no cause, headers or stack", cls.wire.message === "not found" && cls.wire.status === 404 && cls.wire.leaked === false, JSON.stringify(cls.wire));
  check("a required declared field an instance lacks is said once, naming its declaration; the failure is still sent as its class (SV-5a)", cls.missing.warned.length === 1 && /k\.d\.rx#Base declares the field status/.test(cls.missing.warned[0]) && cls.missing.sent === "k.d.rx#Base" && cls.missing.status === false, JSON.stringify(cls.missing));
  check("an optional one (`code?`) may be absent in silence, and is sent when it is there", !cls.missing.warned.some(w => /field code/.test(w)) && cls.missing.code === false && JSON.stringify(cls.missing.full) === JSON.stringify([500, "E"]), JSON.stringify(cls.missing));
  // SV-5a: a declared field the class defines as a getter (`get status() { return 404 }`) is copied as the copy's own data
  // property, the value the instance read: an assignment to the copy would hit the inherited accessor
  writeFileSync(path.join(tmp, "getter.mjs"), `import { createApp } from "@reactivescript/runtime";
import { serialize, deserialize } from "seroval";
class NotFound extends Error { get status() { return 404; } }
const app = createApp({}); app.jsClass(NotFound, "k.d.rx#NotFound", ["status"]);
let out; try { const sent = app.markSendable(new NotFound("gone")); const back = deserialize(serialize(sent)); out = { status: sent.status, own: Object.getOwnPropertyDescriptor(sent, "status")?.value, cls: sent.$class, wire: back.status }; } catch (e) { out = { threw: String(e) }; }
console.log(JSON.stringify(out));
`);
  const getter = JSON.parse(execFileSync(process.execPath, ["getter.mjs"], { cwd: tmp }).toString());
  check("a declared field that is a getter on the class is copied as its value, own data, and crosses (SV-5a)", !getter.threw && getter.status === 404 && getter.own === 404 && getter.cls === "k.d.rx#NotFound" && getter.wire === 404, JSON.stringify(getter));
  // SV-5a: a declared class's identity is the same from every entry and every checkout: a library entry in nested/
  // importing ../err.js, and the app's entry at the root, name err.d.rx alike, from the package, with no machine path
  const idOf = root => {
    rmSync(root, { recursive: true, force: true }); mkdirSync(path.join(root, "nested"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
    writeFileSync(path.join(root, "err.js"), "export class Gone extends Error {}\nexport const load = async () => { throw new Gone(\"x\"); };\n");
    writeFileSync(path.join(root, "err.d.rx"), "export error Gone\nexport pure fn load(): Promise<string> rejects(Gone)\n");
    const page = from => `import { Gone, load } from "${from}"\nexport component Page() {\n  x = await load() catch (e: Gone) => "gone"\n  <p>{x}</p>\n}\n`;
    writeFileSync(path.join(root, "nested/lib.rx"), page("../err.js"));
    writeFileSync(path.join(root, "main.rx"), page("./err.js").replace("export component Page", "export default component Page"));
    const ids = f => [...new Set([...Object.values(JSON.parse(compile(path.join(root, f), "ssr", "@solidjs/web", false, f.includes("nested"))).modules ?? {}).map(m => m.code).join("\n").matchAll(/"([^"]*#Gone)"/g)].map(m => m[1]))];
    return { lib: ids("nested/lib.rx"), main: ids("main.rx") };
  };
  const idA = idOf(path.join(tmp, "checkout-a")), idB = idOf(path.join(tmp, "elsewhere/checkout-b"));
  check("a declared class is named alike from a nested library entry and the root entry, and across checkouts (SV-5a)", idA.lib.length === 1 && JSON.stringify(idA.lib) === JSON.stringify(idA.main) && JSON.stringify(idA.lib) === JSON.stringify(idB.lib) && idA.lib[0] === "shop/err.d.rx#Gone" && !idA.lib[0].includes(tmp), JSON.stringify({ idA, idB }));
  writeFileSync(path.join(tmp, "client.mjs"), `import { createApp } from "@reactivescript/runtime";
import { createRoot, createMemo } from "@solidjs/signals";
class Base extends Error {} class Child extends Base {}
const sent = () => Object.assign(new Error("c"), { $class: "k.d.rx#Child", $classes: ["k.d.rx#Child", "k.d.rx#Base"] });
const caught = (declare, classes) => new Promise(done => createRoot(() => {
  const app = createApp({}); for (const [K, id] of declare) app.jsClass(K, id);
  const v = app.TypedErrored({ classes, fallback: e => e() instanceof Child ? "Child" : e() instanceof Base ? "Base" : "other", get children() { return createMemo(() => { throw sent(); }); } });
  const m = createMemo(() => { try { return v(); } catch { return "passed on"; } });
  setTimeout(() => done(m()), 0);
}));
const both = [[Base, "k.d.rx#Base"], [Child, "k.d.rx#Child"]];
const cases = { child: () => caught(both, [Child]), base: () => caught(both, [Base]), baseOnly: () => caught([[Base, "k.d.rx#Base"]], [Base]) };
console.log(await cases[process.argv[2]]());
`);
  // one process each: the client's class registry is the page's, one program's
  const cl = Object.fromEntries(["child", "base", "baseOnly"].map(c => [c, execFileSync(process.execPath, ["--conditions=browser", "client.mjs", c], { cwd: tmp }).toString().trim()]));
  check("a client boundary typed with the subclass gives the sent error its class", cl.child === "Child", JSON.stringify(cl));
  check("a client boundary typed with the base catches it, as its own class where the client declares it", cl.base === "Child", JSON.stringify(cl));
  check("a client that declares only the base gives it the base", cl.baseOnly === "Base", JSON.stringify(cl));
  // 09 MO-10a: a declared JS primitive is called in an owner of its own (`__rt.inst`), so it is one child of the place
  // it is written whatever it makes inside — a library whose browser path makes effects its server path does not
  // (`if (isServer) return …`) leaves the hydration keys after it alone. On both builds; and the call is untracked.
  const scoped = `import { createApp } from "@reactivescript/runtime";
import { createRoot, getOwner, getNextChildId, getObserver, onSettled, createEffect, createMemo } from "solid-js";
const app = createApp({ root: null });
const after = made => createRoot(() => { app.inst(made); return getNextChildId(getOwner()); }, { id: "t" });
let tracked = "?"; createRoot(() => { createMemo(() => { app.inst(() => { tracked = getObserver() ? "tracked" : "untracked"; }); })(); });
console.log([after(() => {}), after(() => { onSettled(() => {}); createEffect(() => 1, () => {}); createMemo(() => 1); }), tracked].join(" "));`;
  for (const cond of ["browser", "node"]) {
    const got = execFileSync(process.execPath, ["--conditions=" + cond, "--input-type=module", "-e", scoped], { cwd: tmp }).toString().trim();
    check(`a primitive's own owner (${cond}): one id of its component's, whatever it makes${cond === "browser" ? "; called untracked" : ""} (MO-10a)`, got === (cond === "browser" ? "t1 t1 untracked" : "t1 t1 tracked"), got);   // the server's build tracks nothing: its \`untrack\` is a call
  }
  // 09 MO-10a: what the primitive's owner is for its region. Its cleanups are its region's: none runs while the region
  // lives, each runs when the region goes (the primitives' before the component's own), and a region made again takes
  // the primitive it made with it. A failure is the caller's: one thrown while the primitive is made is thrown where the
  // call is written, to the boundary the caller is under; one thrown later by what it made reaches that boundary too.
  const owned = `import { createApp } from "@reactivescript/runtime";
import { createRoot, createSignal, createMemo, createEffect, onCleanup, createErrorBoundary, flush } from "solid-js";
const app = createApp({ root: null });
const out = {};
{ const log = [];
  const dispose = createRoot(d => { app.inst(() => { onCleanup(() => log.push("primitive")); }); onCleanup(() => log.push("component")); app.inst(() => { onCleanup(() => log.push("second primitive")); }); return d; });
  out.before = log.slice(); dispose(); out.disposed = log.slice(); }
{ const log = []; const [n, setN] = createSignal(0);
  const dispose = createRoot(d => { const m = createMemo(() => { const k = n(); app.inst(() => { onCleanup(() => log.push("cleanup " + k)); }); log.push("made " + k); return k; }); createEffect(m, () => {}); return d; });
  flush(); setN(1); flush(); out.rerun = log.slice(); dispose(); out.rerunDisposed = log.slice(); }
{ let caught = null; try { createRoot(() => { app.inst(() => { throw new Error("while made"); }); }); } catch (e) { caught = e.message; } out.sync = caught; }
{ createRoot(() => { const v = createErrorBoundary(() => { const made = createMemo(() => app.inst(() => { throw new Error("under a boundary"); })); return made(); }, err => "caught: " + err().message); out.boundary = v(); }); }
{ let shown; const [n, setN] = createSignal(0);
  createRoot(() => { const v = createErrorBoundary(() => { const read = app.inst(() => createMemo(() => { if (n() > 0) throw new Error("later"); return "fine"; })); return read(); }, err => "caught: " + err().message); createEffect(v, x => { shown = x; }); out.first = v(); });
  flush(); setN(1); flush(); out.later = shown; }
console.log(JSON.stringify(out));`;
  for (const cond of ["browser", "node"]) {
    const o = JSON.parse(execFileSync(process.execPath, ["--conditions=" + cond, "--input-type=module", "-e", owned], { cwd: tmp }).toString().trim());
    const j = JSON.stringify;
    check(`a primitive's cleanups (${cond}): none while its region lives; with the region, the primitives' and then the component's own (MO-10a)`, j(o.before) === "[]" && j(o.disposed) === j(["second primitive", "primitive", "component"]), j([o.before, o.disposed]));
    check(`a failure while a primitive is made (${cond}) is thrown where the call is written, and caught by the boundary above the caller`, o.sync === "while made" && /^caught: /.test(o.boundary ?? ""), j([o.sync, o.boundary]));
    // the server's build computes once: nothing is made again there, and nothing fails later
    if (cond === "browser") {
      check("a region made again disposes the primitive it made, once; the last one goes with the region", j(o.rerun) === j(["made 0", "made 1", "cleanup 0"]) && j(o.rerunDisposed) === j(["made 0", "made 1", "cleanup 0", "cleanup 1"]), j([o.rerun, o.rerunDisposed]));
      check("a failure thrown later by what the primitive made reaches the boundary above the caller", o.first === "fine" && o.later === "caught: later", j([o.first, o.later]));
    } else check("…and on the server's build the region's end runs them too", j(o.rerunDisposed) === j(["made 0", "cleanup 0"]) && o.first === "fine", j([o.rerunDisposed, o.first]));
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
