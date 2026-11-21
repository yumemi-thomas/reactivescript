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
for (const d of ["solid-js", "@solidjs"]) symlinkSync(path.join(here, "node_modules", d), path.join(tmp, "node_modules", d));
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
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
