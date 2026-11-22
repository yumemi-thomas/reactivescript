// The representative-task benchmark (bench/README.md): each task under bench/tasks/ is a job a Solid user does with a
// library of the ecosystem, written as they would write it. Its GOOD program must be accepted by both checkers, keep the
// library's types, and run; each BAD variant is one realistic mistake, one line changed, that must be refused with the
// diagnostic named (or, where only the runtime can know, fail loudly in a development build).
//
// A variant the language has no way to write — refused by the parser, by name resolution or by TypeScript alone (PARSE,
// ASSIGNMENT, UNBOUND, UNKNOWN_COMPONENT, a JS habit's code, a `ts` variant) — is counted apart, as UNREPRESENTABLE: it
// shows that the mistake cannot be spelled, not that a check of the program's meaning caught it. And each task's
// declarations are measured against the tool that drafts them: the words written by hand on top of `rx-declare`'s draft,
// and the `any`s the `.d.rx` files hold.
//
// Usage: node bench/run.mjs [filter…]         the scorecard for every task (or those whose id contains a filter)
//        node bench/run.mjs --check           also compares with bench/scorecard.json: exits 1 when a check that was
//                                             green there is not now (the ratchet CI runs)
//        node bench/run.mjs --check --strict  and when a failure is not one the task's `known` gives a reason for
//        node bench/run.mjs --write           writes bench/scorecard.json and bench/scorecard.txt from this run
//        VERBOSE=1                            prints every check, not only the failures
// Needs: the crate (`cargo build --release` in compiler/), the runtime (`npm run build` in runtime/), the language
// server's packages (`npm ci` in tooling/rx-language-server), Node 22.6+, and the network once (bench/package.json).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { here, ws, workspace, stage, both, rxTsc, edit, Runner, anysWritten, declarations, onEdit } from "./harness.mjs";

/** The codes of a program that cannot be written: the grammar has no position for it (99, bin U as the parser reports
 *  it, and the habits it names), or a name resolves to nothing. */
const UNWRITABLE = new Set(["PARSE", "ASSIGNMENT", "UNBOUND", "UNKNOWN_COMPONENT", "JS_LOCAL", "JS_FUNCTION", "JS_RETURN", "JS_API"]);

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const one = args.includes("--task") ? args[args.indexOf("--task") + 1] : null;

/** One task, in this process: `{ id, title, good, types, runtime, bad, unrep }`, each `{ pass, total, fails: [text] }`,
 *  and `decl`: `{ words, any, files }` (harness.mjs, declarations). */
async function runTask(id) {
  const task = (await import(pathToFileURL(path.join(here, "tasks", id, "task.mjs")).href)).default;
  const dir = stage(id);
  if (task.prepare) await task.prepare(dir);
  const cell = () => ({ pass: 0, total: 0, fails: [], notes: [] });
  const res = { id, title: task.title, good: cell(), types: cell(), runtime: cell(), bad: cell(), unrep: cell(), decl: { words: 0, any: 0, inherited: 0, introduced: 0, places: 0, files: [] }, known: task.known ?? {} };
  const mark = (c, name, ok, why) => { c.total++; if (ok) c.pass++; else c.fails.push(`${name}${why ? ` — ${String(why).replace(/\s+/g, " ").slice(0, 420)}` : ""}`); };
  const show = x => x.diagnostics.map(d => `${d.code}@${d.line}: ${String(d.message ?? "").slice(0, 160)}`).join(" | ") || "accepted";
  const entries = task.entries ?? [task.entry ?? "main.rx"];

  // (a) GOOD: accepted by both checkers, which agree
  let accepted = true;
  for (const e of entries) {
    const r = both(path.join(dir, e), task.spa, task.host);
    const ok = !r.crate.diagnostics.length && !r.ref.diagnostics.length;
    accepted &&= ok;
    mark(res.good, `${e}: accepted by the crate`, !r.crate.diagnostics.length, show(r.crate));
    mark(res.good, `${e}: accepted by ref/`, !r.ref.diagnostics.length, show(r.ref));
    mark(res.good, `${e}: the two agree`, r.agree, `crate: ${show(r.crate)} / ref: ${show(r.ref)}`);
    for (const a of task.advice ?? []) mark(res.good, `${e}: advice ${a}`, r.crate.advice.some(d => d.code === a) && r.ref.advice.some(d => d.code === a), `crate: ${r.crate.advice.map(d => d.code)} / ref: ${r.ref.advice.map(d => d.code)}`);
  }

  // the declarations, against rx-declare's draft of the same modules (before anything is edited)
  try { res.decl = declarations(dir, task.declare ?? {}); } catch (e) { res.decl = { words: 0, any: 0, inherited: 0, introduced: 0, places: 0, files: [], error: String(e.message ?? e) }; }

  // (b) TYPES: rx-tsc is clean with the library's own types, the program wrote no `any`, and each probe — a mistake
  // only the library's real type refuses — is refused by TypeScript, on the line the probe wrote
  if (task.types !== false) {
    const clean = rxTsc(dir);
    mark(res.types, "rx-tsc: clean with the library's types", clean === "", clean);
    const anys = anysWritten(dir);
    mark(res.types, "no `any` written in the .rx", anys.length === 0, anys.join(", "));
    for (const p of task.types ?? []) {
      let undo; try { undo = edit(dir, p.file ?? entries[0], p.edit); } catch (e) { mark(res.types, p.name, false, e.message); continue; }
      const out = rxTsc(dir); undo();
      const there = onEdit(out, dir, p.file ?? entries[0], p.edit);
      mark(res.types, `${p.name} (${p.expect.source})`, p.expect.test(there), !out ? "rx-tsc accepted it: the type was lost" : there ? there : `nothing on the edited line; elsewhere: ${out}`);
    }
  }

  // (c) RUNTIME: the task drives its compiled program (server render, Chromium)
  if (task.run) {
    if (!accepted) mark(res.runtime, "the good program runs", false, "not compiled: the checker refused it");
    else {
      const h = new Runner(dir, entries[0], task.spa);
      try { await task.run(h); } catch (e) { h.check("the run completed", false, e.stack ?? String(e)); }
      await h.close();
      for (const c of h.checks) mark(res.runtime, c.name, c.ok, c.got);
    }
  }

  // (d) BAD: each variant is refused by both checkers with the code named, by a diagnostic the good program does not
  // have — or (`orSafe`) compiles to a program in which the mistake does no harm, or (`dev`) compiles and fails loudly
  // when it is run, or (`ts`) is refused by TypeScript
  const sig = d => `${d.code}|${String(d.message ?? "").replace(/\d+/g, "#")}`;
  const goodDiags = {};
  for (const e of entries) { const r = both(path.join(dir, e), task.spa, task.host); goodDiags[e] = { crate: new Set(r.crate.diagnostics.map(sig)), ref: new Set(r.ref.diagnostics.map(sig)) }; }
  const drive = async (b, how) => {
    const h = new Runner(dir, b.entry ?? entries[0], b.spa ?? task.spa);
    let threw = ""; try { await how(h); } catch (e) { threw = String(e.message ?? e); }
    await h.close();
    return { h, threw };
  };
  for (const b of task.bad ?? []) {
    const col = b.ts || UNWRITABLE.has(b.expect) ? res.unrep : res.bad;   // a mistake that cannot be written is counted apart
    let undo; try { const u1 = edit(dir, b.file ?? entries[0], b.edit); const u2 = b.edit2 ? edit(dir, b.file ?? entries[0], b.edit2) : null; undo = () => { u2?.(); u1(); }; } catch (e) { mark(col, b.name, false, e.message); continue; }
    const e0 = b.entry ?? entries[0]; const entry = path.join(dir, e0);
    try {
      if (b.expect) {
        const spa = b.spa ?? task.spa;
        const r = both(entry, spa, task.host);
        const was = spa === task.spa ? goodDiags[e0] : (() => { undo(); const g = both(entry, spa, task.host); undo = edit(dir, b.file ?? entries[0], b.edit); return { crate: new Set(g.crate.diagnostics.map(sig)), ref: new Set(g.ref.diagnostics.map(sig)) }; })();
        const hit = (x, old) => x.diagnostics.some(d => d.code === b.expect && !old.has(sig(d)));
        let ok = hit(r.crate, was.crate) && hit(r.ref, was.ref) && r.agree, why = `crate: ${show(r.crate)} / ref: ${show(r.ref)}`;
        if (!ok && b.orSafe && !r.crate.diagnostics.length && !r.ref.diagnostics.length) {
          const { h, threw } = await drive(b, b.orSafe);
          const bad = [threw, ...h.checks.filter(c => !c.ok).map(c => `${c.name}: ${c.got ?? ""}`)].filter(Boolean);
          ok = !bad.length && h.checks.length > 0; why = `accepted, and not harmless when run: ${bad.join(" | ")}`;
        }
        mark(col, `${b.name} (${b.expect}${b.orSafe ? ", or harmless" : ""})`, ok, why);
      } else if (b.advise) {
        // advice, never an error (99, the advisory rows): the program is accepted, and both checkers say the same advice
        const r = both(entry, b.spa ?? task.spa, task.host);
        const ok = !r.crate.diagnostics.length && !r.ref.diagnostics.length && r.crate.advice.some(d => d.code === b.advise) && r.ref.advice.some(d => d.code === b.advise) && r.agree;
        mark(res.bad, `${b.name} (advice: ${b.advise})`, ok, `crate: ${show(r.crate)}, advice ${r.crate.advice.map(d => d.code).join(",") || "none"} / ref: ${show(r.ref)}, advice ${r.ref.advice.map(d => d.code).join(",") || "none"}`);
      } else if (b.ts) {
        const out = rxTsc(dir);
        mark(col, `${b.name} (${b.ts.source})`, b.ts.test(out), out || "rx-tsc accepted it");
      } else if (b.dev) {
        // only the runtime can know: the program compiles, and running it reports the mistake where a developer sees it
        const r = both(entry, b.spa ?? task.spa, task.host);
        if (r.crate.diagnostics.length) mark(res.bad, `${b.name} (dev: ${b.dev.source})`, false, `not compiled: ${show(r.crate)}`);
        else {
          const { h, threw } = await drive(b, b.drive);
          const said = [threw, ...h.problems, ...h.checks.filter(c => !c.ok).map(c => c.got ?? "")].join(" | ");
          mark(res.bad, `${b.name} (dev: ${b.dev.source})`, b.dev.test(said), said || "ran silently");
        }
      }
    } finally { undo(); }
  }
  return res;
}

if (one) {
  const r = await runTask(one).catch(e => ({ id: one, crash: e.stack ?? String(e) }));
  writeFileSync(path.join(ws, "tasks", `${one}.result.json`), JSON.stringify(r));
  process.exit(0);
}

workspace();
const filters = args.filter(a => !a.startsWith("--"));
const ids = readdirSync(path.join(here, "tasks"), { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(path.join(here, "tasks", e.name, "task.mjs"))).map(e => e.name).sort().filter(id => !filters.length || filters.some(f => id.includes(f)));
const results = [];
for (const id of ids) {
  const out = path.join(ws, "tasks", `${id}.result.json`);
  const r = spawnSync(process.execPath, [path.join(here, "run.mjs"), "--task", id], { stdio: ["ignore", "inherit", "inherit"], timeout: 600000 });
  let res; try { res = JSON.parse(readFileSync(out, "utf8")); } catch { res = { id, crash: `no result (exit ${r.status}${r.signal ? `, ${r.signal}` : ""})` }; }
  results.push(res);
}

// ---- the scorecard ----
const cols = [["good", "good accepted"], ["types", "types kept"], ["runtime", "runtime ok"], ["bad", "bad caught"], ["unrep", "unrepresentable"]];
// the declarations' two numbers (lower is better; no pass or fail): words written by hand over rx-declare's draft, and `any`s
// (09 MO-8q): an `any` the library's own declaration has (inherited) and one written where it has a type (introduced, which
// must be none, or on bench/any-allowlist.json with its reason); and the parts said by their place in the library's declaration
const nums = [["words", "hand-written words"], ["inherited", "`any` inherited"], ["introduced", "`any` introduced"], ["places", "by-place"]];
const cellText = c => !c || !c.total ? "—" : `${c.pass}/${c.total}`;
const lines = [];
const w = Math.max(...results.map(r => r.id.length), 4);
const cw = t => Math.max(13, t.length);
const rule = "-".repeat(w + [...cols, ...nums].reduce((n, [, t]) => n + cw(t) + 2, 0));
lines.push(`${"task".padEnd(w)}  ${[...cols, ...nums].map(([, t]) => t.padEnd(cw(t))).join("  ")}`);
lines.push(rule);
const total = Object.fromEntries(cols.map(([k]) => [k, { pass: 0, total: 0 }]));
const sum = Object.fromEntries(nums.map(([k]) => [k, 0]));
for (const r of results) {
  if (r.crash) { lines.push(`${r.id.padEnd(w)}  CRASHED: ${r.crash.split("\n")[0]}`); continue; }
  lines.push(`${r.id.padEnd(w)}  ${[...cols.map(([k, t]) => { total[k].pass += r[k].pass; total[k].total += r[k].total; return `${cellText(r[k])}${r[k].total && r[k].pass === r[k].total ? " ✓" : r[k].total ? " ✗" : ""}`.padEnd(cw(t)); }), ...nums.map(([k, t]) => { sum[k] += r.decl[k]; return (r.decl.files.length ? String(r.decl[k]) : "—").padEnd(cw(t)); })].join("  ")}`);
}
lines.push(rule);
lines.push(`${"total".padEnd(w)}  ${[...cols.map(([k, t]) => `${total[k].pass}/${total[k].total}`.padEnd(cw(t))), ...nums.map(([k, t]) => String(sum[k]).padEnd(cw(t)))].join("  ")}`);
const failing = [];
for (const r of results) {
  if (r.crash) { failing.push(`${r.id}: crashed\n    ${r.crash}`); continue; }
  for (const [k, t] of cols) for (const f of r[k].fails) {
    const name = f.split(" — ")[0];
    const reason = Object.entries(r.known).find(([n]) => name.includes(n))?.[1];
    failing.push(`${r.id} · ${t} · ${f}${reason ? `\n    known: ${reason}` : ""}`);
  }
}
// the declarations, file by file: where the hand-written words are
const declLines = results.filter(r => !r.crash && r.decl.files.length).flatMap(r => r.decl.files.map(f => `  ${r.id}/${f.file}: ${f.words} word${f.words === 1 ? "" : "s"} by hand${f.drafted ? "" : " (rx-declare drafts nothing for it: the module has no types)"}, ${f.inherited} \`any\` inherited, ${f.introduced} introduced${f.rows.length ? ` (${f.rows.map(x => `${x.name}: ${x.introduced}`).join(", ")})` : ""}, ${f.places} by place`));
// 09 MO-8q: an `any` written where the library has a type is allowed only by name, with its reason
const allow = JSON.parse(readFileSync(path.join(here, "any-allowlist.json"), "utf8")).allow.filter(a => !a.draft);   // an entry with `draft` is a whole draft's (below)
const allowed = (id, file, name) => allow.find(a => a.task === id && a.file === file && a.name === name);
const introducedRows = results.filter(r => !r.crash).flatMap(r => r.decl.files.flatMap(f => f.rows.map(x => ({ id: r.id, file: f.file, ...x, entry: allowed(r.id, f.file, x.name) }))));
const allowLines = introducedRows.map(x => `  ${x.id}/${x.file} · ${x.name}: ${x.introduced} — ${x.entry ? `allowed (${x.entry.count}): ${x.entry.reason} Blocked by: ${x.entry.blocked}` : "NOT ON bench/any-allowlist.json"}`);
// 09 MO-8q over whole drafts: every export of each module a task declares, as rx-declare drafts it now
const wholeFiles = results.filter(r => !r.crash).flatMap(r => r.decl.files.filter(f => f.drafted).map(f => ({ id: r.id, ...f })));
const wholeSum = k => wholeFiles.reduce((n, f) => n + f.whole[k], 0);
const wholeLines = wholeFiles.map(f => `  ${f.id} · ${f.spec}: ${f.whole.rows} rows, ${f.whole.vendor} \`any\` the library's own, ${f.whole.introduced} introduced${f.whole.introducedRows.length ? ` (${f.whole.introducedRows.map(x => `${x.name}: ${x.introduced}, ${x.causes.join("/")}`).join("; ")})` : ""}, ${f.whole.places} by place`);
const wholeAllowed = (id, spec, name) => allowDrafts.find(a => a.task === id && a.draft === spec && a.name === name);
const allowAll = JSON.parse(readFileSync(path.join(here, "any-allowlist.json"), "utf8")).allow;
const allowDrafts = allowAll.filter(a => a.draft);
const wholeRows = wholeFiles.flatMap(f => f.whole.introducedRows.map(x => ({ id: f.id, spec: f.spec, ...x, entry: wholeAllowed(f.id, f.spec, x.name) })));
const wholeCard = wholeFiles.length ? `\n\nWhole drafts (09 MO-8q: every export of each module a task declares, drafted by rx-declare; ${wholeFiles.length} drafts, ${wholeSum("rows")} rows): ${wholeSum("vendor")} \`any\` the libraries' own, ${wholeSum("introduced")} introduced, ${wholeSum("places")} by place\n${wholeLines.join("\n")}${wholeRows.length ? `\n  introduced, row by row:\n${wholeRows.map(x => `    ${x.id} · ${x.spec} · ${x.name}: ${x.introduced} (${x.causes.join(", ")}) — ${x.entry ? `allowed (${x.entry.count}): ${x.entry.reason} Blocked by: ${x.entry.blocked}` : "NOT ON bench/any-allowlist.json"}`).join("\n")}` : ""}` : "";
const card = lines.join("\n") + (failing.length ? `\n\nNot green (${failing.length}):\n${failing.map(f => `  ✗ ${f}`).join("\n")}` : "\n\nAll green.") + (declLines.length ? `\n\nDeclarations (words written by hand over rx-declare's draft; \`any\`s the library's own declaration has, and \`any\`s written where it has a type; parts said by place):\n${declLines.join("\n")}` : "") + `\n\nIntroduced \`any\`s (09 MO-8q: none, or on bench/any-allowlist.json):${allowLines.length ? `\n${allowLines.join("\n")}` : " none"}`;
console.log("\n" + card + wholeCard);

const snapshot = Object.fromEntries(results.map(r => [r.id, r.crash ? { crash: true } : { ...Object.fromEntries(cols.map(([k]) => [k, { pass: r[k].pass, total: r[k].total, fails: r[k].fails.map(f => f.split(" — ")[0]) }])), decl: { words: r.decl.words, any: r.decl.any, inherited: r.decl.inherited, introduced: r.decl.introduced, places: r.decl.places, draft: r.decl.draft } }]));
if (flag("--write")) {
  writeFileSync(path.join(here, "scorecard.json"), JSON.stringify(snapshot, null, 2) + "\n");
  writeFileSync(path.join(here, "scorecard.txt"), (card + wholeCard).replaceAll(ws, "bench/.out/ws") + "\n");
}
let exit = 0;
if (flag("--check")) {
  // the ratchet: nothing that the committed scorecard has green may be red, and every red is a documented one
  const was = JSON.parse(readFileSync(path.join(here, "scorecard.json"), "utf8"));
  const problems = [];
  for (const r of results) {
    const old = was[r.id];
    if (r.crash) { problems.push(`${r.id}: crashed`); continue; }
    for (const [k, t] of cols) for (const f of r[k].fails) {
      const name = f.split(" — ")[0];
      if (old && !old[k]?.fails.includes(name)) problems.push(`${r.id} · ${t} · ${name}: was green in bench/scorecard.json`);
      else if (flag("--strict") && !Object.keys(r.known).some(n => name.includes(n))) problems.push(`${r.id} · ${t} · ${name}: fails, and the task's \`known\` gives no reason for it`);
    }
    // the declarations may not need more hand-written words, nor hold more `any`s, than the committed scorecard's
    // nor more parts said by place (09 MO-8q: each of the numbers, and the `any`s together, task by task)
    for (const [k, t] of [...nums, ["any", "`any` in .d.rx"]]) if (old?.decl && old.decl[k] !== undefined && r.decl[k] > old.decl[k]) problems.push(`${r.id} · ${t}: ${r.decl[k]}, was ${old.decl[k]} in bench/scorecard.json`);
    // 09 MO-8q over whole drafts: drafting every export of the task's modules may not write more `any`s of the draft's
    // own, nor say more parts by place, than the committed scorecard's (the library's own `any`s are the library's)
    for (const [k, t] of [["introduced", "`any` introduced in whole drafts"], ["places", "by-place in whole drafts"]]) if (old?.decl?.draft && r.decl.draft[k] > old.decl.draft[k]) problems.push(`${r.id} · ${t}: ${r.decl.draft[k]}, was ${old.decl.draft[k]} in bench/scorecard.json`);
    if (flag("--strict")) for (const n of Object.keys(r.known)) if (!cols.some(([k]) => r[k].fails.some(f => f.split(" — ")[0].includes(n)))) problems.push(`${r.id}: \`known\` names "${n}", which does not fail (remove it)`);
  }
  // 09 MO-8q: an `any` where the library has a type is on the allowlist, by name and count, or it fails
  for (const x of introducedRows) { if (!x.entry) problems.push(`${x.id}/${x.file} · ${x.name}: ${x.introduced} \`any\` written where the library has a type (09 MO-8q): name its type, or add it to bench/any-allowlist.json with the reason`); else if (x.introduced > x.entry.count) problems.push(`${x.id}/${x.file} · ${x.name}: ${x.introduced} introduced \`any\`s, ${x.entry.count} allowed in bench/any-allowlist.json`); }
  for (const x of wholeRows) { if (!x.entry) problems.push(`${x.id} · whole draft of ${x.spec} · ${x.name}: ${x.introduced} \`any\` the draft wrote where the library has a type (09 MO-8q; ${x.causes.join(", ")}): fix rx-declare, or add it to bench/any-allowlist.json (\`draft\`: the module) with the reason and what blocks naming it`); else if (x.introduced > x.entry.count) problems.push(`${x.id} · whole draft of ${x.spec} · ${x.name}: ${x.introduced} introduced \`any\`s, ${x.entry.count} allowed in bench/any-allowlist.json`); }
  if (!filters.length) for (const a of allowDrafts) if (!wholeRows.some(x => x.entry === a)) problems.push(`bench/any-allowlist.json: ${a.task} · whole draft of ${a.draft} · ${a.name} holds no introduced \`any\` now (remove the entry)`);
  if (!filters.length) for (const a of allow) if (!introducedRows.some(x => x.entry === a)) problems.push(`bench/any-allowlist.json: ${a.task}/${a.file} · ${a.name} holds no introduced \`any\` now (remove the entry)`);
  if (problems.length) { console.log(`\n--check: ${problems.length} problem(s)\n${problems.map(p => `  ${p}`).join("\n")}`); exit = 1; } else console.log("\n--check: as bench/scorecard.json, or better; every failure is a documented one");
}
process.exit(exit);
