// The built package as an app takes it (after `npm run build`, and the compiler's Node-API build in ../compiler): the
// browser build (the `browser` condition) and the server build (`node`) export the runtime, and a program compiled
// for ssr by the crate renders on the server build over the Solid release this package names.
// Usage: node test.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, ".test"); rmSync(tmp, { recursive: true, force: true }); mkdirSync(path.join(tmp, "node_modules/@reactivescript"), { recursive: true });
symlinkSync(here, path.join(tmp, "node_modules/@reactivescript/runtime"));
for (const d of ["solid-js", "@solidjs", "seroval"]) symlinkSync(path.join(here, "node_modules", d), path.join(tmp, "node_modules", d));
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
  // CP-4d: a ?rx-lib component rendered on the server outside a request throws, unless the host passes the app
  writeFileSync(path.join(tmp, "lib.rx"), "export component Hello() {\n  <b>hi</b>\n}\n");
  const lib = JSON.parse(compile(path.join(tmp, "lib.rx"), "ssr", "@solidjs/web", false, true));
  writeFileSync(path.join(tmp, "lib.mjs"), lib.modules[Object.keys(lib.modules).find(k => k.endsWith("lib.rx"))].code);
  writeFileSync(path.join(tmp, "host.mjs"), `import pages from "./lib.mjs";\nimport { components, createApp } from "@reactivescript/runtime";\nlet threw = "";\ntry { components(pages).Hello({}); } catch (e) { threw = String(e.message); }\nlet ok = true;\ntry { components(pages, createApp()).Hello({}); } catch (e) { ok = String(e.message); }\nconsole.log(JSON.stringify({ threw, ok }));\n`);
  const host = JSON.parse(execFileSync(process.execPath, ["host.mjs"], { cwd: tmp }).toString());
  check("a ?rx-lib component rendered on the server outside a request throws (CP-4d)", /outside a request/.test(host.threw), host.threw);
  check("the same with the app passed renders", host.ok === true, String(host.ok));
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
console.log(JSON.stringify({ baseFirst: stamp([B, C], new Child("c")), childFirst: stamp([C, B], new Child("c")), baseOnly: stamp([B], new Child("c")), grand: stamp([B, C], new Grand("g")), plain: stamp([B, C], new Error("p")),
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
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
