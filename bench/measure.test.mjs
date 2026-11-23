// The measures of bench/harness.mjs, on rows whose answer is known: an `any` counts where it stands (09 MO-8q).
//   node bench/measure.test.mjs
import { createRequire } from "node:module";
import { vendorPlaces, anysAgainst } from "./harness.mjs";
const { rowsOf } = createRequire(import.meta.url)("../tooling/rx-language-server/src/rows.js");
let bad = 0;
/** `drafted`: the library's row, every `any` of it its own; `kept`: the row a declaration keeps. */
const is = (what, drafted, kept, want) => {
  const anys = drafted.replace(/"[^"]*"/g, "").match(/\bany\b/g) ?? [];
  const vendor = vendorPlaces(drafted + "\n", [{ row: drafted, anys: anys.map(() => "vendor-any") }]);
  const row = rowsOf("kept.d.rx", kept + "\n")[0];
  const got = anysAgainst(row, vendor.get(row.name)[0]);
  const ok = got.inherited === want[0] && got.introduced === want[1]; if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${what}: ${got.inherited} inherited, ${got.introduced} introduced${ok ? "" : ` (wanted ${want})`}`);
};
is("the library's own, kept as it is", "export fn label(value: any): string", "export fn label(value: any): string", [1, 0]);
is("moved from the parameter to the result", "export fn label(value: any): string", "export fn label(value: string): any", [0, 1]);
is("moved inside a function type, from its parameter to its result", "export fn on(f: (e: any) => string): void", "export fn on(f: (e: string) => any): void", [0, 1]);
is("moved from one type argument to another", "export fn m(): Map<any, string>", "export fn m(): Map<string, any>", [0, 1]);
is("moved from one field of a record to another", "export fn r(o: { a: any; b: string }): void", "export fn r(o: { a: string; b: any }): void", [0, 1]);
is("a part of what the library types `any` whole", "export fn w(o: any): void", "export fn w(o: { a: any }): void", [1, 0]);
is("a second one at a place that has one", "export fn u(a: any): void", "export fn u(a: any, b: any): void", [1, 1]);
is("the word in a string literal is no type", "export fn s(a: \"any\"): void", "export fn s(a: \"any\"): void", [0, 0]);
process.exit(bad ? 1 : 0);
