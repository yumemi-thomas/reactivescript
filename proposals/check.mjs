#!/usr/bin/env node
// Runs every program of proposals/ that is marked to be run, and compares the verdicts the documents state.
//   node proposals/check.mjs [--upstream <an exported, built origin/main>] [--prototype <proto-all, built>] [--only <text in a file's name>] [-v]
// With --upstream, the verdicts stated for upstream are compared as well. Its export is built once (README.md says how).
//
// A block to run is a fenced program after a comment of one of these kinds. `-- file: ./x` lines divide a fence into
// files; the part before the first is main.rx.
//   <!-- check  branch=ok upstream=CODE -->          both checkers (rxc and ref/check.ts). A verdict is `ok` or the codes,
//                                                    joined by `+`; `A|B` where rxc says A and ref/ says B
//   <!-- frames branch=pass upstream=fail -->         the program and the table of frames after it, as a scenario, in the
//                                                    crate's compiled code (`runner=ref`: the reference's interpreter;
//                                                    `ref-compiled`: its emitter; `ssr`: served and hydrated in Chromium).
//                                                    `fail` is a wrong frame or a throw; `refused`, a check that fails
//   <!-- app    branch=ok says-upstream="…" -->       rxc app, what the Vite front end is given: `ok` or `failed`; its JSON is the output
//   <!-- scenario branch=fail upstream=pass -->       a ````md fence: a whole scenario, in the reference's interpreter
//   <!-- tool   branch=failed tool=verify args=x.d.rx -->   a tool of the language server's bin/ (this branch's alone): its exit, and what it says
// What cannot be run — no build, no Chromium, a module not installed — is `setup`: it is counted apart and is no verdict.
//   <!-- types  branch=ok upstream=TS2345 -->         rx-tsc over the files: its codes, checkers' codes included
//   <!-- tsx    branch=ok upstream=TS2345 -->         types, where main.tsx is what uses the .rx
// `prototype=` is a verdict of the prototype of 19, 20 and 21, a local branch that is not published: this tree does not run
// it. `--prototype <folder>` runs the programs so marked there.
// `says-branch="text"` and `says-upstream="text"` ask that the output hold the text. `files=<dir>` copies a folder of proposals/ beside.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const here = import.meta.dirname, repo = dirname(here);
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const verbose = process.argv.includes("-v"), only = arg("--only"), up = arg("--upstream"), proto = arg("--prototype");
const roots = { branch: repo, ...(up ? { upstream: resolve(up) } : {}), ...(proto ? { prototype: resolve(proto) } : {}) };
for (const [name, root] of Object.entries(roots)) for (const f of ["compiler/target/release/rxc", "ref/node_modules/solid-js", "runtime/dist/web.js", "tooling/rx-language-server/node_modules"]) if (!existsSync(join(root, f))) { console.log(`SETUP ${name}: no ${f} in ${root} (README.md says how it is built)`); process.exit(2); }
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "rx-proposals-")));
const node = (args, cwd, env = {}) => { const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } }); return (r.stdout ?? "") + (r.stderr ?? ""); };
const uniq = xs => [...new Set(xs)].sort();

/** The reference with scenarios of our own beside it: ref/ copied, the rest linked. */
function mirror(name, root) {
  const at = join(tmp, name); if (existsSync(at)) return at;
  mkdirSync(join(at, "scenarios"), { recursive: true });
  cpSync(join(root, "ref"), join(at, "ref"), { recursive: true, filter: f => !/\/ref\/(node_modules|ssr\/\.out|compile\/\.out|types\/\.out|.*\/node_modules)$/.test(f) && !/\/\.out$/.test(f) });
  symlinkSync(join(root, "ref/node_modules"), join(at, "ref/node_modules"));
  for (const d of ["compiler", "runtime", "spec", "examples", "tooling", "guide"]) if (existsSync(join(root, d))) symlinkSync(join(root, d), join(at, d));
  return at;
}
function filesOf(body) {
  const out = new Map(); let name = "main.rx", lines = [];
  for (const l of body.split("\n")) { const m = /^-- file: \.?\/?(\S+)\s*$/.exec(l); if (m) { if (lines.join("").trim()) out.set(name, lines.join("\n") + "\n"); name = m[1]; lines = []; } else lines.push(l); }
  if (lines.join("").trim()) out.set(name, lines.join("\n") + "\n");
  return out;
}
let seq = 0;
function folder(b) {
  const dir = join(tmp, `p${++seq}`); mkdirSync(dir);
  if (b.attrs.files) cpSync(join(here, b.attrs.files), dir, { recursive: true });
  for (const [f, text] of filesOf(b.body)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
}
const codes = text => uniq([...text.matchAll(/\berror ([A-Z][A-Z0-9_]*|TS\d+)\b/g)].map(m => m[1]));
const said = text => { const c = codes(text); return c.length ? c.join("+") : "ok"; };
const kinds = {
  check(root, b) {
    const dir = folder(b), flags = (b.attrs.flags ?? "").split(",").filter(Boolean), file = b.attrs.main ?? "main.rx";
    const a = spawnSync(join(root, "compiler/target/release/rxc"), ["check", ...flags, file], { cwd: dir, encoding: "utf8" });
    const c = a.stdout + a.stderr, r = node(["--experimental-strip-types", join(root, "ref/check.ts"), ...flags.filter(f => f !== "--spa"), file], dir);
    const cv = said(c) === "ok" && a.status ? "failed" : said(c), parse = /: parse error: /.test(r) && cv !== "ok";   // a parse error the reference prints without a code
    const rv = parse ? cv : said(r) === "ok" && !/^ok /m.test(r) ? "failed" : said(r);
    return { got: flags.includes("--spa") || cv === rv ? cv : `${cv}|${rv}`, out: c + "\n--- ref\n" + r };
  },
  frames(root, b, name) {
    const at = mirror(name, root); for (const f of readdirSync(join(at, "scenarios"))) rmSync(join(at, "scenarios", f));
    const fs = filesOf(b.body), mods = [...fs].filter(([f]) => f !== "main.rx");
    const md = `# S-proposal-1 — a program of proposals/\n\nRules exercised: none.\n\n` + (mods.length ? "## Modules\n\n" + mods.map(([f, t]) => "```rx\n-- module: ./" + f + "\n" + t + "```\n").join("\n") + "\n" : "") + "## Program\n\n```rx\n" + fs.get("main.rx") + "```\n\n## Frames\n\n" + b.table + "\n" + (b.attrs.runner === "ssr" ? "## Server frames\n\n" + b.table + "\n" : "");
    writeFileSync(join(at, "scenarios/S-proposal-1.md"), md);
    const out = b.attrs.runner === "ref" ? node(["--experimental-strip-types", "run.ts"], join(at, "ref"))
      : b.attrs.runner === "ref-compiled" ? node(["--experimental-strip-types", "--conditions=browser", "--conditions=development", "compile/run.ts"], join(at, "ref"))
      : b.attrs.runner === "ssr" ? node(["--experimental-strip-types", "ssr/run.ts"], join(at, "ref"), { RX_CRATE: "1" })
      : node(["--experimental-strip-types", "--conditions=browser", "--conditions=development", "compile/run.ts"], join(at, "ref"), { RX_CRATE: "1" });
    return { got: /refused by the checker|not compiled/.test(out) ? "refused" : /^PASS S-proposal-1/m.test(out) ? "pass" : "fail", out };
  },
  app(root, b) {
    const dir = folder(b), a = spawnSync(join(root, "compiler/target/release/rxc"), ["app", "main.rx"], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 });
    return { got: a.status || /"diagnostics":\s*\[\s*\{/.test(a.stdout) ? "failed" : "ok", out: a.stdout + a.stderr };
  },
  scenario(root, b, name) {
    const at = mirror(name, root); for (const f of readdirSync(join(at, "scenarios"))) rmSync(join(at, "scenarios", f));
    writeFileSync(join(at, "scenarios/S-proposal-1.md"), b.body + "\n");
    const out = node(["--experimental-strip-types", "run.ts", "S-proposal-1"], join(at, "ref"));
    return { got: /^PASS S-proposal-1/m.test(out) ? "pass" : "fail", out };
  },
  tool(root, b) {
    const dir = folder(b); symlinkSync(join(repo, "ref/node_modules"), join(dir, "node_modules"));
    const r = spawnSync(process.execPath, [join(root, `tooling/rx-language-server/bin/${b.attrs.tool}.js`), ...(b.attrs.args ?? "").split(",").filter(Boolean)], { cwd: dir, encoding: "utf8" });
    return { got: r.status ? "failed" : "ok", out: r.stdout + r.stderr };
  },
  types(root, b) {
    const dir = folder(b);
    symlinkSync(join(repo, "ref/node_modules"), join(dir, "node_modules"));
    if (!existsSync(join(dir, "tsconfig.json"))) writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "esnext", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: true, jsx: "preserve", jsxImportSource: "@solidjs/web", types: [], allowJs: true, allowArbitraryExtensions: true }, include: ["**/*"], exclude: ["node_modules"] }));
    const out = node([join(root, "tooling/rx-language-server/bin/tsc.js"), "-p", "tsconfig.json", "--noEmit"], dir, { RX_GENERATE: "0" });
    return { got: said(out), out };
  },
};
kinds.tsx = kinds.types;

function blocks(file) {
  const text = readFileSync(file, "utf8"), out = [], re = /<!--\s*(check|frames|app|scenario|tool|types|tsx)\s+((?:(?!-->)[^\n])*?)-->\s*\n(````?)(?:rx|tsx|ts|text|md)\n([\s\S]*?)\n\3(?!`)/g;
  for (const m of text.matchAll(re)) {
    const attrs = {}; for (const a of m[2].matchAll(/([\w-]+)=(?:"([^"]*)"|(\S+))/g)) attrs[a[1]] = a[2] ?? a[3];
    const rest = text.slice(m.index + m[0].length), table = /^\s*((?:\|.*\n?)+)/.exec(rest)?.[1] ?? "";
    out.push({ kind: m[1], attrs, body: m[4], table, line: text.slice(0, m.index).split("\n").length });
  }
  const marks = [...text.matchAll(/^<!--\s*(check|frames|app|scenario|tool|types|tsx)\s/gm)].length;
  if (marks !== out.length) { console.log(`${relative(repo, file)}: ${marks} marks, ${out.length} programs read`); bad++; }
  return out;
}
/** A run that did not get as far as the program. */
const noSetup = out => /ERR_MODULE_NOT_FOUND|Cannot find (module|package) '(?!\.{1,2}\/)|browserType\.launch|Executable doesn't exist/.test(out);
let ran = 0, bad = 0, setup = 0;
const docs = [...readdirSync(here).filter(f => f.endsWith(".md")).map(f => join(here, f)), ...readdirSync(join(here, "bugs")).filter(f => f.endsWith(".md")).map(f => join(here, "bugs", f))].filter(f => !only || f.includes(only)).sort();
for (const d of docs) for (const b of blocks(d)) for (const [name, root] of Object.entries(roots)) {
  const want = b.attrs[name]; if (want === undefined && name === "prototype") continue;
  if (want === undefined) { console.log(`${relative(repo, d)}:${b.line}: no verdict stated for ${name}`); bad++; continue; }
  if (want === "-") continue;
  const r = kinds[b.kind](root, b, name), out = r.out, text = b.attrs[`says-${name}`]; let got = r.got;
  if (got !== want && (noSetup(out) || !out.trim() || (b.kind === "frames" && !/^(PASS|FAIL|SKIP) S-proposal-1/m.test(out)))) { setup++; console.log(`SETUP ${relative(repo, d)}:${b.line} ${b.kind} ${name}: not run — ${(out.split("\n").find(l => noSetup(l)) ?? "no output").trim().slice(0, 200)}`); continue; }
  ran++;
  const ok = got === want && (!text || out.includes(text)); if (!ok) bad++;
  if (!ok || verbose) console.log(`${ok ? "ok  " : "FAIL"} ${relative(repo, d)}:${b.line} ${b.kind} ${name}: ${got}${ok ? "" : `, stated ${want}${text && !out.includes(text) ? `, saying ${JSON.stringify(text)}` : ""}`}${verbose ? "\n" + out.replaceAll(/^/gm, "     | ").slice(0, 1600) : ""}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${ran} verdicts compared over ${docs.length} documents${up ? "" : " (this branch only: --upstream <path> for both)"}: ${bad ? `${bad} differ` : "all as stated"}${setup ? `; ${setup} could not be run (setup)` : ""}`);
process.exit(bad ? 1 : setup ? 2 : 0);
