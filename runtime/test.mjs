// The built package as an app takes it (after `npm run build`, and the compiler's Node-API build in ../compiler): the
// browser build (the `browser` condition) and the server build (`node`) export the runtime, and a program compiled
// for ssr by the crate renders on the server build over the Solid release this package names.
// Usage: node test.mjs
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, ".test"); rmSync(tmp, { recursive: true, force: true }); mkdirSync(path.join(tmp, "node_modules/@reactivescript"), { recursive: true });
symlinkSync(here, path.join(tmp, "node_modules/@reactivescript/runtime"));
for (const d of ["solid-js", "@solidjs", "seroval", "seroval-plugins"]) symlinkSync(path.join(here, "node_modules", d), path.join(tmp, "node_modules", d));
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
    for (const d of copied) cpSync(path.join(here, "node_modules", d), path.join(dup, "node_modules", d), { recursive: true, dereference: true });
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
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
