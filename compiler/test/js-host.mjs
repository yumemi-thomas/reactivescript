// A compiled package under a JavaScript host (09 MO-13e), in Chromium and on the server: what the host's children print
// where the component reads them — by `props`, by a pattern, by a rest — and what a value prints beside them; a prop a
// `ref` closure reads is a snapshot (H-10: Solid's development build reports none); a name imported for its type alone is
// not imported when the module runs.
// Needs what bench/run.mjs needs (the crate, the runtime's build, bench/.out/ws).   node compiler/test/js-host.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ws, repo, workspace } from "../../bench/harness.mjs";

workspace();
const dir = path.join(ws, "js-host"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const rxc = process.env.RXC ?? path.join(repo, "compiler/target/release/rxc"), req = createRequire(path.join(ws, "package.json"));
writeFileSync(path.join(dir, "types.js"), "export {};\n");
writeFileSync(path.join(dir, "types.d.ts"), "export type T = { a: number };\n");
writeFileSync(path.join(dir, "kit.rx"), `import { T } from "./types.js"
export component Direct(props: { children?: View, n?: number }) {
  <i>{props.children}</i>
}
export component Pattern({ children, n }: { children?: View, n?: number }) {
  <i>{children}</i>
}
export component Rest(props: { children?: View, n?: number }) {
  { n, ...rest } = props
  <i>{rest.children}</i>
}
export component Value(props: { n?: number }) {
  x: T = { a: 1 }
  <i>{props.n} {x.a}</i>
}
export component Ref(props: { f: (e: Element) => void }) {
  <p ref={(e: Element) => { props.f(e) }}>x</p>
}
`);
for (const target of ["dom", "ssr"]) {
  const app = JSON.parse(execFileSync(rxc, ["app", path.join(dir, "kit.rx"), "--lib", "--target", target], { encoding: "utf8", maxBuffer: 1 << 26 }));
  if (!app.modules) { console.error(JSON.stringify(app).slice(0, 2000)); process.exit(1); }
  for (const m of Object.values(app.modules)) writeFileSync(path.join(dir, `kit.${target}.mjs`), m.code);
}
let fail = 0; const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    ${JSON.stringify(got)}`}`); };
const CASES = [["none"], ["undefined", undefined, ""], ["null", null, ""], ["false", false, ""], ["true", true, ""], ["text", "a", "a"], ["a number", 0, "0"], ["a list of text", ["a", "b"], "ab"], ["text and a number", ["a", 1], "a1"], ["a function", "fn", "f"]];
writeFileSync(path.join(dir, "cases.mjs"), `import { createComponent } from "solid-js";
const CASES = ${JSON.stringify(CASES.map(([n, v]) => [n, v === undefined ? "undefined" : v]))};
export const views = lib => ["Direct", "Pattern", "Rest"].flatMap(C => CASES.map(([n, v]) => () => createComponent(lib[C], n === "none" ? {} : { children: n === "undefined" ? undefined : n === "a function" ? () => "f" : v })));
`);
const want = ["Direct", "Pattern", "Rest"].flatMap(() => CASES.map(([, , w]) => w ?? ""));
const { build } = req("esbuild");
const r = await build({ stdin: { resolveDir: dir, contents: `import kit from "./kit.dom.mjs"; import { views } from "./cases.mjs"; import { library } from "@reactivescript/runtime"; import { createSignal, createComponent } from "solid-js"; import { render } from "@solidjs/web";
const lib = library(kit, "kit/kit"); window.shown = views(lib).map(v => { const at = document.createElement("div"); render(v, at); return at.textContent; });
const at = document.createElement("div"); render(() => createComponent(lib.Value, {}), at); window.value = at.textContent;
const [g] = createSignal(1); window.seen = 0; render(() => createComponent(lib.Ref, { get f() { g(); return () => { window.seen++; }; } }), document.createElement("div"));` }, bundle: true, write: false, format: "esm", conditions: ["browser", "development"], logLevel: "error" });
const browser = await req("playwright").chromium.launch(); const page = await browser.newPage(); const said = [];
page.on("console", m => { if (m.type() !== "log") said.push(m.text().split("\n")[0]); }); page.on("pageerror", e => said.push(e.message));
await page.setContent("<p></p>"); await page.addScriptTag({ type: "module", content: r.outputFiles[0].text }); await page.waitForTimeout(100);
const got = await page.evaluate(() => [window.shown, window.value, window.seen]);
check("children of a JavaScript host, in the browser", JSON.stringify(got[0]) === JSON.stringify(want), [got[0], want]);
check("a value prints as it did, beside a name imported for its type", got[1] === "undefined 1", got[1]);
check("a `ref` closure's read of a prop is a snapshot", got[2] === 1 && !said.some(s => /STRICT_READ/.test(s)), [got[2], said]);
await browser.close();
writeFileSync(path.join(dir, "server.mjs"), `import kit from "./kit.ssr.mjs"; import { views } from "./cases.mjs"; import { library } from "@reactivescript/runtime"; import { createComponent } from "solid-js"; import { renderToString } from "@solidjs/web";
const lib = library(kit, "kit/kit"); const text = v => renderToString(v).replace(/<!--.*?-->|<[^>]*>/g, "");
console.log(JSON.stringify([views(lib).map(text), text(() => createComponent(lib.Value, {}))]));`);
const s = spawnSync(process.execPath, ["server.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });
const [shown, value] = s.status === 0 ? JSON.parse(s.stdout.trim().split("\n").pop()) : [];
check("children of a JavaScript host, on the server", JSON.stringify(shown) === JSON.stringify(want) && value === "undefined 1", [shown, want, value, s.stderr.slice(-600)]);
// rx-lib ships the modules a package imports for their types alone: with no row, with one, and where there are only types
{
  const pkg = path.join(dir, "pkg"); mkdirSync(path.join(pkg, "src"), { recursive: true });
  const put = (name, text) => writeFileSync(path.join(pkg, name), text);
  put("package.json", JSON.stringify({ name: "kit", type: "module", peerDependencies: { "solid-js": "^2.0.0", "@solidjs/web": "^2.0.0", "@reactivescript/runtime": "*" } }));
  put("src/bare.js", "export {};\n"); put("src/bare.d.ts", `import type { Deep } from "./deep.js";\nexport type Bare = { deep: Deep };\n`);
  put("src/deep.d.ts", "export type Deep = number;\n");
  put("src/rows.js", "export {};\n"); put("src/rows.d.ts", "export type Row = { a: string };\n"); put("src/rows.d.rx", "export type Row = { a: string }\n");
  put("src/index.rx", `import { Bare } from "./bare.js"\nimport { Row } from "./rows.js"\nexport component A(props: { b: Bare, r: Row }) {\n  <i>{props.b.deep}{props.r.a}</i>\n}\n`);
  process.env.RXC = rxc; process.env.RX_TSC = path.join(repo, "tooling/rx-language-server/bin/tsc.js");
  const b = (await import("../lib.mjs")).build(pkg, { write: true });
  const missing = ["bare.d.ts", "bare.js", "deep.d.ts", "rows.d.ts", "rows.d.rx"].filter(x => !existsSync(path.join(pkg, "dist", x)));
  check("rx-lib ships what a package imports for its types alone", b.ok && !missing.length, [b.problems, missing]);
}
console.log(fail ? `${fail} failed` : "ok");
process.exit(fail ? 1 : 0);
