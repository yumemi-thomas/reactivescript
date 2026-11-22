// Usage: node --experimental-strip-types ref/check.ts [--signature] [--whole-program] file.rx...
// Runs the checker (08) over each file and every .rx module it imports (09: dependencies first, each against its imports'
// signatures), and prints every diagnostic. --signature also prints each module's signature as .d.rx text (MO-3).
// --host m.rx (with --whole-program): a module a JS host imports with ?rx-lib (CP-4d), whose components JS applies.
// --whole-program (E-5a): the modules loaded are the whole program, so a kept peek of a prop or a provision is decided by
// every application and provision in them, not refused because one module alone cannot tell.
import { realpathSync } from "node:fs";
import { isFile, readDisk } from "./disk.ts";
import { resolve } from "node:path";
import { loadModules } from "./src/modules.ts";
import { checkModules } from "./src/check.ts";
import { printSignature } from "./src/signature.ts";
const args = process.argv.slice(2); const sigOut = args.includes("--signature"); const whole = args.includes("--whole-program");
const hosts = args.flatMap((a, i) => args[i - 1] === "--host" ? [resolve(a)] : []);   // E-5a: modules a JS host imports with ?rx-lib (CP-4d)
let bad = 0;
for (const f of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--host")) {
  if (!isFile(resolve(f))) { bad++; console.log(`${f}: error MODULE_NOT_FOUND [MO-6] no module ${f}: the file does not exist or cannot be read`); continue; }   // never an empty program that checks
  try {
    const set = loadModules(resolve(f), readDisk);
    // E-5a: a host is the module whose real path is its own (a key may go through a symlink, a host's path another way)
    const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
    const keyed = hosts.flatMap(h => { const ks = set.order.filter(k => k === h || real(k) === real(h)); return ks.length ? ks : [h]; });
    const { diags, sigs, advice } = checkModules(set, false, whole, keyed);
    const rel = (p?: string) => (p ?? resolve(f)).replace(process.cwd() + "/", "");
    if (!diags.length) console.log(`ok   ${f}${set.order.length > 1 ? ` (+${set.order.length - 1} module${set.order.length > 2 ? "s" : ""})` : ""}`);
    else { bad++; for (const d of diags) console.log(`${rel(d.file)}:${d.line}: error ${d.code} [${d.rule}] ${d.msg}`); }
    for (const d of advice) console.log(`${rel(d.file)}:${d.line}: advice ${d.code} [${d.rule}] ${d.msg}`);   // 99, the advisory rows: never an error
    if (sigOut) for (const p of set.order) console.log(printSignature(sigs.get(p)!));
  } catch (e) {
    // a parse error is printed as the crate prints it: its line, and the code of the habit it reads like (99: JS_LOCAL, …), else PARSE
    bad++; const err = e as Error & { code?: string }; const m = /^(.*?): line (\d+): ([\s\S]*)$/.exec(err.message);
    console.log(m ? `${m[1].replace(process.cwd() + "/", "")}:${m[2]}: error ${err.code ?? "PARSE"} [07] ${m[3]}` : `${f}: parse error: ${err.message}`);
  }
}
process.exit(bad ? 1 : 0);
