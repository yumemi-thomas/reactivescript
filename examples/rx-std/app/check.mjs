// main.rx is accepted by both checkers; each one-line mistake is refused, and by what.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { both } from "../../../bench/harness.mjs";
const at = new URL("./", import.meta.url).pathname, good = readFileSync(at + "main.rx", "utf8");
const mistakes = [
  ["media: made in a handler", 'onClick={() => { pager.set(2) }}', 'onClick={() => { createMediaQuery("x", false) }}'],
  ["media: a fixed query given a changing value", 'createMediaQuery("(min-width: 640px)"', 'createMediaQuery(`(min-width: ${n}px)`'],
  ["sortable: made where the view computes", "{sorted.length}", "{createSorted(list, (a, b) => a - b).length}"],
  ["pagination: the page set while the view computes", "{pager.page}</button>", "{pager.set(2)}</button>"],
  ["keyboard: the package's state written", "pager.set(2) }", "keys := [] }"],
  ["resize-observer: the package's state written", "pager.set(2) }", "windowSize.width := 1 }"],
  ["storage: read where nothing takes its failure", "{errored fallback(e) { <p>{e.message}</p> } { {loading fallback { <p>…</p> } { <Saved /> }} }}", "<Saved />"],
  ["timer: a poll made in a handler", "pager.set(2) }", "createPolled(x => x, n, 0) }"],
  ["history: undone while the view computes", "{control.name}", "{createUndoHistory(() => null, {}).undo()}"],
  ["presence: done() called while the view computes", "{if seen.isMounted {", "{if seen.done(1) {"],
  ["form-control: registered while the view computes", "{control.name}", "{control.registerLabel(\"x\")}"],
  ["controlled-props: a field's setter that answers nothing, called in the view", "setValue={setN}", "setValue={setN(2)}"],
];
const run = t => { writeFileSync(at + "probe.rx", t); const b = both(at + "probe.rx"); rmSync(at + "probe.rx"); return [b.crate.diagnostics.map(d => d.code).join(" ") || "ok", b.agree]; };
console.log("good program:", ...run(good));
for (const [name, a, b] of mistakes) { if (!good.includes(a)) throw new Error(name); console.log(name, "→", ...run(good.replace(a, b))); }
