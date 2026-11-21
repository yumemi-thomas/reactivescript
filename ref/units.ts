// Unit checks for what the scenarios cannot reach (the crate holds the same cases as #[test]s, under the same names).
// Run by run.ts after the scenarios; exits non-zero on the first failure.
import { deepStrictEqual } from "node:assert";
import { packageRelative } from "./src/modules.ts";
import { looksLikeTypes, parseProgram } from "./src/parse.ts";

const files = (fs: Record<string, string>) => (p: string) => fs[p];
export const units: [string, () => void][] = [
  ["unnamed_package_scopes_side_by_side_name_their_classes_apart", () => {   // SV-5a
    let read = files({ "/w/app/a/package.json": `{"type":"module"}`, "/w/app/b/package.json": `{"type":"module"}` });
    deepStrictEqual([packageRelative("/w/app/a/err.d.rx", "/w/app/main.rx", read), packageRelative("/w/app/b/err.d.rx", "/w/app/main.rx", read)], ["a/err.d.rx", "b/err.d.rx"]);
    read = files({ "/w/app/package.json": "{}", "/w/app/a/package.json": `{"type":"module"}`, "/w/app/b/package.json": `{"type":"module"}` });
    deepStrictEqual(packageRelative("/w/app/a/err.d.rx", "/w/app/main.rx", read), "a/err.d.rx");
    deepStrictEqual(packageRelative("/w/app/b/err.d.rx", "/w/app/src/main.rx", read), "b/err.d.rx");
    read = files({ "/w/app/package.json": `{"name":"shop"}`, "/w/app/a/package.json": `{"type":"module"}` });
    deepStrictEqual(packageRelative("/w/app/a/err.d.rx", "/w/app/main.rx", read), "shop/a/err.d.rx");
    read = files({ "/w/app/package.json": `{"name":"shop"}` });
    deepStrictEqual(packageRelative("/w/app/src/err.d.rx", "/w/app/main.rx", read), "shop/src/err.d.rx");
  }],
  ["a_wire_id_holds_no_machine_path_and_no_checkout_name", () => {   // SV-5a
    for (const root of ["/private/tmp/x/my-app", "/home/ci/build-101", "/Users/a/dev/proj"]) {
      const read = files({ [`${root}/package.json`]: `{"type":"module","private":true}` });
      deepStrictEqual(packageRelative(`${root}/err.d.rx`, `${root}/main.rx`, read), "err.d.rx");
      deepStrictEqual(packageRelative(`${root}/lib/err.d.rx`, `${root}/src/main.rx`, read), "lib/err.d.rx");
    }
    let read = files({ "/home/u/package.json": "{}", "/home/u/work/proj/package.json": `{"type":"module"}` });
    deepStrictEqual(packageRelative("/home/u/work/proj/err.d.rx", "/home/u/work/proj/main.rx", read), "err.d.rx");
    read = files({});
    deepStrictEqual(packageRelative("/w/x/err.d.rx", "/w/x/main.rx", read), "err.d.rx");
    deepStrictEqual(packageRelative("a/err.d.rx", "main.rx", read), "a/err.d.rx");
    read = files({ "/w/lib/package.json": "{}", "/w/app/package.json": "{}" });
    deepStrictEqual(packageRelative("/w/lib/err.d.rx", "/w/app/main.rx", read), "err.d.rx");
    read = files({ "/w/app/package.json": "{}" });
    deepStrictEqual(packageRelative("/w/x/err.d.rx", "/w/app/main.rx", read), undefined);
  }],
  ["type_arguments_with_a_brace_in_a_string", () => {   // R4 (RFC 11): the crate's type_arguments_are_parsed_completely cases
    for (const t of ["`x${\"}\"}`", "`x${'}'}`", "`x${`}`}`", "`x${\"{\"}`", "{ k: `x${\"}\"}` }", "\"}\""]) deepStrictEqual([t, looksLikeTypes(t)], [t, true]);
    for (const t of ["`x${\"}\" + 1}`", "`x${\"}\"`"]) deepStrictEqual([t, looksLikeTypes(t)], [t, false]);
  }],
  ["a_brace_in_a_string_type_argument_keeps_the_call", () => {   // R4
    for (const [src, targs] of [["x = f<`k${\"}\"}`>(1)\n", "`k${\"}\"}`"], ["x = f<\"}\">(1)\n", "\"}\""], ["x = f<{ a: `${'}'}` }>(1)\n", "{ a: `${'}'}` }"]]) {
      const json = JSON.stringify(parseProgram(src));
      if (!json.includes(`"targs":${JSON.stringify(targs)}`)) throw new Error(`${src}: ${json}`);
    }
  }],
];
