// The reference checker's answer for one program, as JSON: `{ diagnostics: [{ file, line, code, rule, message }], advice }`
// or `{ error }`. What bench/run.mjs compares with `rxc check --json`.
// Usage: node --experimental-strip-types bench/ref-check.ts [--spa] [--host] entry.rx     (--host: the entry is a module a
// JS host imports with ?rx-lib, checked as the whole program, CP-4d)
import { resolve } from "node:path";
import { readDisk } from "../ref/disk.ts";
import { loadModules } from "../ref/src/modules.ts";
import { checkModules } from "../ref/src/check.ts";

export function answer(entry: string, spa: boolean, host: boolean) {
  try {
    const checked = checkModules(loadModules(entry, readDisk), spa, host, host ? [entry] : []) as { diags: { file?: string; line: number; code: string; rule: string; msg: string }[]; advice?: { file?: string; line: number; code: string; rule: string; msg: string }[] };
    const row = (d: { file?: string; line: number; code: string; rule: string; msg: string }) => ({ file: d.file ?? entry, line: d.line, code: d.code, rule: d.rule, message: d.msg });
    return { diagnostics: checked.diags.map(row), advice: (checked.advice ?? []).map(row) };
  } catch (e) { return { error: (e as Error).message, code: (e as { code?: string }).code ?? "PARSE" }; }
}
if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(answer(resolve(args.find(a => !a.startsWith("--"))!), args.includes("--spa"), args.includes("--host"))));
}
