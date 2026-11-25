// The table of REPORT.md, from what the runs wrote: .results (tests), live.json, check.json, size.json. node report.mjs > table.md
import { readFileSync, existsSync } from "node:fs"; import path from "node:path";
const here = import.meta.dirname, J = (f) => existsSync(path.join(here, f)) ? JSON.parse(readFileSync(path.join(here, f), "utf8")) : {};
const res = (f) => { const m = {}; const j = J(".results/" + f); for (const t of j.testResults ?? []) m[path.relative(path.join(here, "test"), t.name)] = t.assertionResults; return m; };
const T = { o: res("orig-test.json"), r: res("rx-test.json"), os: res("orig-ssr.json"), rs: res("rx-ssr.json") };
const live = J("live.json"), check = J("check.json"), size = J("size.json");
const pass = (a) => a ? a.filter((x) => x.status === "passed").length : 0;
const tests = (files) => { let o = 0, r = 0, n = 0; for (const f of files) { o += pass(T.o[f] ?? T.os[f]); r += pass(T.r[f] ?? T.rs[f]); n += (T.o[f] ?? T.os[f] ?? []).length; } return n ? `${o} · ${r} of ${n}` : "–"; };
const ROWS = [
  ["Kobalte Switch", "kobalte", ["kobalte/switch.test.tsx"], "kobalte-switch", "kobalte-switch"],
  ["Kobalte Checkbox", "kobalte", ["kobalte/checkbox.test.tsx"], "kobalte-checkbox", "kobalte-checkbox"],
  ["Kobalte Button, ToggleButton", "kobalte", ["kobalte/button.test.tsx", "kobalte/toggle-button.test.tsx"], null, null],
  ["Kobalte ToggleGroup", "kobalte", ["kobalte/toggle-group.test.tsx"], "kobalte-toggle-group", "kobalte-toggle-group"],
  ["Kobalte Collapsible", "kobalte", ["kobalte/collapsible.test.tsx"], null, null],
  ["Kobalte Accordion", "kobalte", ["kobalte/accordion.test.tsx"], "kobalte-accordion", "kobalte-accordion"],
  ["Kobalte Tabs", "kobalte", ["kobalte/tabs.test.tsx"], "kobalte-tabs", "kobalte-tabs"],
  ["Kobalte RadioGroup", "kobalte", ["kobalte/radio-group.test.tsx"], "kobalte-radio", "kobalte-radio"],
  ["Kobalte Pagination", "kobalte", ["kobalte/pagination.test.tsx"], "kobalte-pagination", "kobalte-pagination"],
  ["Kobalte Meter, Progress", "kobalte", ["kobalte/meter.test.tsx", "kobalte/progress.test.tsx"], "kobalte-progress", "kobalte-progress"],
  ["Kobalte Separator, Breadcrumbs, Link, Alert, Badge", "kobalte", ["kobalte/separator.test.tsx", "kobalte/breadcrumbs.test.tsx", "kobalte/link.test.tsx", "kobalte/alert.test.tsx", "kobalte/badge.test.tsx"], null, "kobalte-breadcrumbs"],
  ["Kobalte Dialog", "kobalte", ["kobalte/dialog.test.tsx"], "kobalte-dialog", "kobalte-dialog"],
  ["Kobalte Popover", "kobalte", [], null, "kobalte-popover"],
  ["Kobalte Tooltip", "kobalte", [], "kobalte-tooltip", "kobalte-tooltip"],
  ["Kobalte Select", "kobalte", ["kobalte/select.test.tsx"], "kobalte-select", "kobalte-select"],
  ["Kobalte Toast (data API)", "kobalte", [], null, null],
  ["terracotta Button, Switch", "terracotta", ["terracotta/button.test.tsx", "terracotta/switch.test.tsx"], "terracotta-switch", "terracotta-switch"],
  ["terracotta Disclosure", "terracotta", ["terracotta/disclosure.test.tsx"], "terracotta-disclosure", "terracotta-disclosure"],
  ["terracotta Dialog", "terracotta", ["terracotta/dialog.test.tsx"], "terracotta-dialog", "terracotta-dialog"],
  ["terracotta Menu", "terracotta", ["terracotta/menu.test.tsx"], "terracotta-menu", "terracotta-menu"],
  ["terracotta RadioGroup", "terracotta", ["terracotta/radio-group.test.tsx"], "terracotta-radio", "terracotta-radio"],
  ["terracotta Listbox", "terracotta", ["terracotta/listbox.test.tsx"], "terracotta-listbox", "terracotta-listbox"],
  ["cmdk-solid Command", "cmdk", [], "cmdk", "cmdk"],
  ["solid-slider", "slider", [], "slider", "slider"],
  ["icon set (lucide-like)", "icons", [], "icons", "icons"],
  ["CodeMirror / Tiptap in a component", "editors", [], null, null],
  ["toast kit (solid-toast / sonner-like)", "toast", [], null, null],
  ...["checkbox", "switch", "accordion", "tooltip", "listbox"].map((p) => [`UI SDK ${p}`, "ui-sdk", [], `ui-${p}`, `ui-${p}`]),
];
const prims = Object.keys(size).filter((k) => k.startsWith("p-")).sort();
for (const p of prims) ROWS.push([`@solid-primitives/${p.slice(2)}`, p, Object.keys({ ...T.o, ...T.os }).filter((f) => f.startsWith(p + "/")), null, null]);
const L = (pkg) => { const s = size[pkg]; return s ? `${s.rx} / ${s.js} / ${s.decl} / ${s.facade}` : "–"; };
const counted = new Set();
console.log("| package / part | tests: original · rewrite | live: client, hydrated (same steps of) | alive after 50 mounts: orig · rx | lines .rx / JS / decl. / facade (package) | gzip B: original · rx in app with runtime · rx alone | mistakes caught: rx / draft / TSX (of 12) | correct refused: rx / draft / TSX (of 8) |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [name, pkg, files, chk, lv] of ROWS) {
  const l = live[lv], c = check[chk], s = size.cases?.[lv];
  const lines = counted.has(pkg) ? "″" : L(pkg); counted.add(pkg);
  console.log(`| ${name} | ${tests(files)} | ${l && !l.failed ? `${l.same}, ${l.sameSsr} of ${l.steps}` : "–"} | ${l?.alive ? `${l.alive.orig?.[0] ?? "?"} · ${l.alive.rx?.[0] ?? "?"}` : "–"} | ${lines} | ${s ? `${s.orig} · ${s.withRuntime} · ${s.alone}` : "–"} | ${c ? `${c.caught.rx} / ${c.caught.orig} / ${c.caught.tsx}` : "–"} | ${c ? `${c.refused.rx} / ${c.refused.orig} / ${c.refused.tsx}` : "–"} |`);
}
const all = (k) => Object.values(check).reduce((n, c) => n + c[k].rx, 0);
console.log(`\nChecks over ${Object.keys(check).length} programs: caught ${Object.values(check).reduce((n, c) => n + c.caught.rx, 0)} / ${Object.values(check).reduce((n, c) => n + c.caught.orig, 0)} / ${Object.values(check).reduce((n, c) => n + c.caught.tsx, 0)} of ${12 * Object.keys(check).length}; correct refused ${Object.values(check).reduce((n, c) => n + c.refused.rx, 0)} / ${Object.values(check).reduce((n, c) => n + c.refused.orig, 0)} / ${Object.values(check).reduce((n, c) => n + c.refused.tsx, 0)} of ${8 * Object.keys(check).length}.`);
const tot = (k) => Object.entries(T[k]).filter(([f]) => ROWS.some((r) => r[2].includes(f))).reduce((n, [, a]) => n + pass(a), 0);
console.log(`Tests: client ${tot("o")} · ${tot("r")}, server ${tot("os")} · ${tot("rs")} (original · rewrite, of the files in the table).`);
