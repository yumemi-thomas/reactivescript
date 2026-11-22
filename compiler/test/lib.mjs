// The library build (spec/09 MO-13e): `rx-lib` over a small package written in .rx — what it writes, the marker on the
// signatures it ships, the `exports` it holds the package.json to, and that an .rx app compiled against the installed
// package imports the factory by the package's name. bench/tasks/rx-package runs such a package for real (an .rx app
// and a .tsx app, in Chromium and on the server); this needs only the crate.
// Usage: node compiler/test/lib.mjs   (after `cargo build --release` in compiler/, or `npm run build` for the Node-API build)
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const rxc = process.env.RXC || path.join(repo, "compiler/target/release/rxc");
if (existsSync(rxc)) process.env.RXC = rxc;   // else the Node-API build
const { build, exportsOf } = await import("../lib.mjs");

let fail = 0;
const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${typeof got === "string" ? got : JSON.stringify(got)}`.slice(0, 900)}`); };

const dir = mkdtempSync(path.join(tmpdir(), "rx-lib-"));
const pkg = path.join(dir, "pkg");
cpSync(path.join(repo, "bench/tasks/rx-package/src/package"), pkg, { recursive: true });
const dist = f => path.join(pkg, "dist", f);
const read = f => readFileSync(dist(f), "utf8");

// 1. the layout
let r = build(pkg, { types: false });
check("the package builds", r.ok, r.problems);
const must = ["index.js", "index.server.js", "index.dom.js", "index.ssr.js", "index.dom.js.map", "index.d.rx", "index.d.ts", "theme.js", "theme.server.js", "theme.dom.js", "theme.ssr.js", "theme.d.rx", "theme.d.ts", "rates.js", "rates.d.ts"];
check("each module: a browser and a server build, what an import resolves to on each side, its signature, its types", must.every(f => existsSync(dist(f))), must.filter(f => !existsSync(dist(f))));
check("the signature is marked, and is the compiler's print", /^\/\/@ signature index\.rx /.test(read("index.d.rx")) && /^export source rate: pending fails\(Error \| Offline\) = …$/m.test(read("index.d.rx")) && /uses\(\.\/theme\.rx#theme\)/.test(read("index.d.rx")), read("index.d.rx"));
check("a dependency's factory is its own compiled module, on each side", /from "\.\/theme\.dom\.js"/.test(read("index.dom.js")) && /from "\.\/theme\.ssr\.js"/.test(read("index.ssr.js")) && /from "\.\/rates\.js"/.test(read("index.dom.js")), read("index.dom.js").split("\n").filter(l => /^import .*from "\./.test(l)));
check("the browser build is hydratable DOM code and the server build writes strings", /getNextElement/.test(read("index.dom.js")) && /ssrHydrationKey/.test(read("index.ssr.js")) && !/ssrHydrationKey/.test(read("index.dom.js")), "targets");
check("what an import resolves to: the factory as __rx, and each export bound by the runtime's library()", /import __rx from "\.\/index\.dom\.js";/.test(read("index.js")) && /import __rx from "\.\/index\.ssr\.js";/.test(read("index.server.js")) && /export \{ __rx \};/.test(read("index.js")) && ["Offline", "code", "rate", "pick", "useLabel", "Badge", "Rate"].every(n => read("index.js").includes(`export const ${n} = __lib.${n};`)) && !/theme/.test(read("index.js")), read("index.js"));
check("a context and a type are .rx's: not values of the JS module", !/export const theme\b/.test(read("theme.js")) && /export const ThemeProvider = /.test(read("theme.js")) && /export type \{ Theme \}/.test(read("theme.d.ts")), read("theme.js"));
check("the .d.ts says what JavaScript gets: a source is an accessor, a `ref` parameter one too, an error class tests instances", /export declare const rate: \(\) => typeof __m\.rate;/.test(read("index.d.ts")) && /useLabel: \(\.\.\.args: __Refs<Parameters<typeof __m\.useLabel>, \[true\]>\) => \(\) => ReturnType<typeof __m\.useLabel>;/.test(read("index.d.ts")) && /\[Symbol\.hasInstance\]\(e: unknown\): e is __m\.Offline/.test(read("index.d.ts")), read("index.d.ts"));
check("the source map carries the .rx", JSON.parse(read("index.dom.js.map")).sourcesContent?.[0]?.includes("export source rate"), "sourcesContent");
check("exportsOf reads a printed signature's rows", JSON.stringify(exportsOf("//@ signature x.rx\nexport type T\nexport context c: T\nexport source a := …\nexport b: pending\nexport pure fn f(ref a: number, b) instantiates\nexport pure fn g(a)\nexport server fn s(a)\nexport action go\nexport error E(code)\nexport component C(props: {})\n")) === JSON.stringify([["T", "type"], ["c", "context"], ["a", "accessor"], ["b", "accessor"], ["f", "primitive", [true, false]], ["g", "fn", [false]], ["s", "server"], ["go", "action"], ["E", "error"], ["C", "component"]]), exportsOf("export pure fn g(a)\n"));

// 2. the exports map is held to what was built
const json = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8"));
writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ ...json, exports: { ".": "./dist/index.js" }, peerDependencies: {} }));
r = build(pkg, { types: false });
check("a package.json whose exports do not name the builds is refused, with the map", !r.ok && r.problems.some(p => /"exports"/.test(p) && /index\.server\.js/.test(p)) && r.problems.some(p => /peerDependencies/.test(p) && /@reactivescript\/runtime/.test(p)), r.problems);
r = build(pkg, { types: false, write: true });
const written = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8"));
check("--write writes it: Solid's conditions, the server build for node, deno and worker, the browser build otherwise", r.ok && JSON.stringify(written.exports["."]) === JSON.stringify({ types: "./dist/index.d.ts", worker: "./dist/index.server.js", browser: "./dist/index.js", deno: "./dist/index.server.js", node: "./dist/index.server.js", default: "./dist/index.js" }) && written.exports["./theme"]?.browser === "./dist/theme.js" && written.peerDependencies["solid-js"] === "^2.0.0", written);
check("and the next build agrees with it", build(pkg, { types: false }).ok, "second build");

// 3. what a package cannot carry, and what the checker refuses, is said
writeFileSync(path.join(pkg, "src/extra.rx"), "export server fn save(id: number) { return id }\n");
r = build(pkg, { types: false, entries: ["src/index.rx", "src/theme.rx", "src/extra.rx"] });
check("an exported server fn is refused (MO-13f)", !r.ok && r.problems.some(p => /server fn save/.test(p)), r.problems);
writeFileSync(path.join(pkg, "src/extra.rx"), "export component Bad() {\n  source n := 1\n  <p>{n := 2}</p>\n}\n");
r = build(pkg, { types: false, entries: ["src/extra.rx"] });
check("a module the checker refuses is not built", !r.ok && r.problems.length > 0, r.problems);
rmSync(path.join(pkg, "src/extra.rx"));
check("the package builds again", build(pkg, { types: false }).ok, "third build");

// 4. an .rx app against the installed package: checked by the shipped signature, compiled to import its factory
const app = path.join(dir, "app");
mkdirSync(path.join(app, "node_modules/@bench/rates"), { recursive: true });
cpSync(path.join(pkg, "package.json"), path.join(app, "node_modules/@bench/rates/package.json"));
cpSync(path.join(pkg, "dist"), path.join(app, "node_modules/@bench/rates/dist"), { recursive: true });
cpSync(path.join(repo, "bench/tasks/rx-package/src/main.rx"), path.join(app, "main.rx"));
const compile = (target) => { const x = spawnSync(rxc, ["app", path.join(app, "main.rx"), "--target", target], { encoding: "utf8", maxBuffer: 1 << 27 }); try { return JSON.parse(x.stdout); } catch { return { error: x.stderr || x.stdout }; } };
if (existsSync(rxc)) {
  const out = compile("dom"); const code = Object.values(out.modules ?? {})[0]?.code ?? "";
  check("the app compiles against the package's .d.rx alone", !!out.modules && !out.diagnostics, out);
  check("its import of the package is the factory, by the package's name (MO-13c)", /import \{ __rx as (__m\d+) \} from "@bench\/rates";/.test(code) && /import \{ __rx as (__m\d+) \} from "@bench\/rates\/theme";/.test(code) && /__rt\.module\((__m\d+), \1\)/.test(code), code.split("\n").filter(l => /@bench|__rt\.module/.test(l)));
  check("the modules read are the package's own, nothing drafted", (out.asked ?? []).some(f => f.endsWith("node_modules/@bench/rates/dist/index.d.rx")) && Object.keys(out.modules).length === 1, out.asked);
  writeFileSync(path.join(app, "main.rx"), readFileSync(path.join(app, "main.rx"), "utf8").replace("  <footer><Own /></footer>", "  <footer><Own /> <Badge label=\"late\" /></footer>"));
  const bad = compile("dom");
  check("a mistake across the package boundary is refused where it is written", (bad.diagnostics ?? []).some(d => d.code === "CONTEXT_NOT_FOUND"), bad.diagnostics ?? bad);
} else console.log("- no rxc binary: the app's compile is bench/tasks/rx-package's");

rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nlib: all passed");
process.exit(fail ? 1 : 0);
