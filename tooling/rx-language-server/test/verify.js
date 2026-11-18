// `rx-verify` (bin/verify.js) on a small module: a hook that really reads a context passes, one that does not is a
// mismatch, as are an export the module lacks and an "error" that is not an Error subclass.
//   node test/verify.js
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/verify");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws, { recursive: true });
fs.symlinkSync(path.join(repo, "ref/node_modules"), path.join(ws, "node_modules"), "dir");
fs.writeFileSync(path.join(ws, "lib.mjs"), [
  "import { createContext, useContext } from \"solid-js\";",
  "const Theme = createContext();",
  "export const useTheme = () => { const t = useContext(Theme); if (!t) throw new Error(\"no theme\"); return t; };",
  "export const useClock = () => Date.now();",
  "export class NotFound extends Error {}",
  "export class Plain {}",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "lib.d.rx"), [
  "export context theme",
  "export pure fn useTheme(): string uses(theme)",
  "export pure fn useClock(): number uses(theme)",
  "export pure fn useMissing(): number",
  "export error NotFound",
  "export error Plain",
  "",
].join("\n"));

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok || process.env.VERBOSE ? `\n      ${JSON.stringify(got).slice(0, 2000)}` : ""}`);
}
const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/verify.js"), "lib.d.rx"], { cwd: ws, encoding: "utf8" });
const out = r.stdout + r.stderr;
check("a hook that throws with no provider holds its uses(…)", /lib\.d\.rx:2 ok\s+useTheme: uses\(…\) holds/.test(out), out);
check("a hook that does not is a mismatch", /lib\.d\.rx:3 MISMATCH\s+useClock: declared uses\(…\), but called with no provider it does not throw/.test(out), out);
check("an export the module lacks is a mismatch", /lib\.d\.rx:4 MISMATCH\s+useMissing: lib\.mjs exports nothing by that name/.test(out), out);
check("an error class is checked to be an Error subclass", /lib\.d\.rx:5 ok\s+NotFound/.test(out) && /lib\.d\.rx:6 MISMATCH\s+Plain: declared an error/.test(out), out);
check("mismatches fail the run", r.status === 1, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
