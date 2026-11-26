// The coverage suite (bench/README.md): where a task is one job with its mistakes, an entry here is one package used
// once — every package of the libraries bench/coverage/libraries.json lists, so that "the ecosystem" is a list that is
// held and not a sample. For each: every module the package exports is drafted whole by `rx-declare` (09 MO-8q: no
// `any` of the draft's own), and a program that uses it as its documentation does is accepted by both checkers, typed
// by the library's own types and run (rendered on the server where the package is server-safe, and in Chromium).
// bench/run.mjs runs it after the tasks; `--check` holds bench/coverage/coverage.json as it holds the scorecard.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { here, ws, claimKinds, claimsSaid, compact, pool, longestFirst, took, together } from "./harness.mjs";

const root = path.join(here, "coverage");
/** Every entry, `<group>/<name>`: a folder with a `use.mjs`. */
export function entries() {
  const out = [];
  for (const g of readdirSync(root, { withFileTypes: true })) if (g.isDirectory()) for (const n of readdirSync(path.join(root, g.name), { withFileTypes: true })) if (n.isDirectory() && existsSync(path.join(root, g.name, n.name, "use.mjs"))) out.push(`${g.name}/${n.name}`);
  return out.sort();
}
const idOf = entry => `cover-${entry.replaceAll("/", "-")}`;
const cols = [["good", "accepted"], ["types", "types"], ["runtime", "runs"], ["bad", "bad caught"]];   // bad: an entry's own one-line mistakes (`bad` in its use.mjs), judged as a task's are

export async function runCoverage({ filters = [], check = false, strict = false, write = false, shard = null, after = null } = {}) {
  const all = entries();
  // `--shard i/n` (CI: the suite over several machines): every n-th entry, and every n-th module no entry drafts. What
  // an entry drafts and imports is read off its `use.mjs`, so the list (below) is held whole by every shard
  const mine = k => !shard || k % shard[1] === shard[0] - 1;
  const ids = all.filter((id, k) => filters.length ? filters.some(f => id.includes(f) || `cover-${id.replaceAll("/", "-")}`.includes(f)) : mine(k));
  if (!ids.length) return { problems: [] };

  const libs = JSON.parse(readFileSync(path.join(root, "libraries.json"), "utf8"));
  // every module the libraries list is drafted whole: the ones no entry drafted (a large library's entries draft none
  // themselves), each in a process of its own, with the entries' pool. Only in a whole run: a filtered one is its entries'
  const listed = Object.entries(libs).flatMap(([lib, l]) => Object.values(l.packages ?? {}).flatMap(v => v.modules.map(m => ({ lib, spec: m }))));
  const stated = filters.length ? [] : await Promise.all(all.map(async id => { try { const t = (await import(pathToFileURL(path.join(root, id, "use.mjs")).href)).default; return { id, modules: t.modules ?? [], uses: t.uses ?? [] }; } catch { return { id, modules: [], uses: [] }; } }));
  const had = new Set(stated.flatMap(e => e.modules));
  const unowned = listed.filter(x => !had.has(x.spec));
  const todo = filters.length ? [] : unowned.filter((x, k) => mine(k));
  // entries are independent programs in folders of their own: several at once, and the drafts among them — what took
  // longest before first (harness.mjs, longestFirst), so that no process is left alone with one at the end
  const work = longestFirst([...todo.map(x => ({ x })), ...ids.toReversed().map(id => ({ id }))], w => w.x ? `draft-${w.x.spec.replace(/[^\w.-]+/g, "_")}` : idOf(w.id));
  // what took little time before is run several to a process (harness.mjs, together): a process's start was most of it
  const idOfWork = w => w.x ? `draft-${w.x.spec.replace(/[^\w.-]+/g, "_")}` : idOf(w.id), small = w => (took(idOfWork(w)) ?? Infinity) < 1.5, batches = [];
  for (const w of work) { const last = batches.at(-1); if (small(w) && last?.length && small(last[0]) && last.length < 8) last.push(w); else batches.push([w]); }
  const got = (await pool(batches, ws_ => together(ws_.map(w => w.x
    ? { args: ["--draft", w.x.spec], id: idOfWork(w), crash: crash => ({ spec: w.x.spec, crash }) }
    : { args: ["--cover", w.id], id: idOf(w.id), crash: crash => ({ id: idOf(w.id), entry: w.id, crash }) }), 900000))).flat();
  const done = batches.flat().map((w, i) => {
    const [r] = got[i];
    if (w.x) return { ...r, lib: w.x.lib };
    if (process.env.VERBOSE) console.error(`  coverage ${w.id}: ${r.crash ? "CRASHED" : cols.map(([k]) => `${r[k].pass}/${r[k].total}`).join(" ")}`); return r;
  });
  work.splice(0, work.length, ...batches.flat());
  const extra = todo.map(x => done[work.findIndex(w => w.x === x)]), results = ids.map(id => done[work.findIndex(w => w.id === id)]);
  const groupOf = lib => results.find(r => !r.crash && r.pkgs?.some(p => Object.keys(libs[lib].packages).includes(p)))?.entry.split("/")[0] ?? lib;
  const version = pkg => { try { return JSON.parse(readFileSync(path.join(ws, "node_modules", pkg, "package.json"), "utf8")).version; } catch { return "?"; } };
  const ok = r => !r.crash && cols.every(([k]) => r[k].pass === r[k].total);
  const cell = c => !c || !c.total ? "—" : `${c.pass}/${c.total}`;
  // ---- the table: a row a module, with the entry whose program imports it ----
  const rows = [];
  for (const r of results) {
    if (r.crash) { rows.push({ group: r.entry.split("/")[0], spec: `(${r.entry})`, crash: r.crash, entry: r.entry }); continue; }
    for (const m of r.modules ?? []) rows.push({ group: r.entry.split("/")[0], spec: m.spec, version: version(r.pkgs.find(p => m.spec === p || m.spec.startsWith(p + "/")) ?? m.spec), ...m, used: r.uses.includes(m.spec), entry: r.entry, words: r.decl.words, inherited: r.decl.inherited, kept: r.decl.introduced, keptPlaces: r.decl.places, good: cell(r.good), types: cell(r.types), runtime: cell(r.runtime), bad: cell(r.bad), green: ok(r), server: r.server === true, hydrates: r.hydrates === true });
  }
  for (const m of extra) rows.push(m.crash ? { group: groupOf(m.lib), spec: m.spec, crash: m.crash, entry: "—" } : { group: groupOf(m.lib), spec: m.spec, version: version(Object.keys(libs[m.lib].packages).find(p => m.spec === p || m.spec.startsWith(p + "/")) ?? m.spec), ...m, used: false, entry: "no program" });
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.spec.localeCompare(b.spec));
  const lines = [];
  const head = ["module", "version", "rows drafted", "`any` library's", "introduced", "by place", "inferred", "TODOs", "used by", "hand words", "accepted", "types", "runs", "bad caught", "server", "hydrated"];
  const table = rs => {
    const data = rs.map(x => x.crash ? [x.spec, "CRASHED", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] : [x.spec, x.version, x.drafted ? String(x.rows) : "no draft", String(x.vendor), String(x.introduced), String(x.places), String(x.inferred ?? 0), String(x.todos ?? 0), x.used ? x.entry : x.entry === "no program" ? "—" : `— (${x.entry})`, x.used ? String(x.words) : "", x.used ? x.good : "", x.used ? x.types : "", x.used ? x.runtime : "", x.used ? x.bad : "", x.used ? (x.server ? "yes" : "no") : "", x.used ? (x.hydrates ? "yes" : "no") : ""]);
    const w = head.map((h, i) => Math.max(h.length, ...data.map(d => d[i].length)));
    return [head.map((h, i) => h.padEnd(w[i])).join("  "), w.map(n => "-".repeat(n)).join("  "), ...data.map(d => d.map((c, i) => c.padEnd(w[i])).join("  "))];
  };
  const groups = [...new Set(rows.map(x => x.group))];
  const sum = (rs, k) => rs.reduce((n, x) => n + (Number(x[k]) || 0), 0);
  for (const g of groups) {
    const rs = rows.filter(x => x.group === g); const es = results.filter(r => r.entry.split("/")[0] === g);
    lines.push(`\n${g}: ${rs.length} modules drafted (${sum(rs, "rows")} rows, ${sum(rs, "vendor")} \`any\` the libraries' own, ${sum(rs, "introduced")} introduced, ${sum(rs, "places")} by place, ${sum(rs, "inferred")} words read from the code, ${sum(rs, "todos")} questions asked); ${es.length} programs, ${es.filter(ok).length} green; ${es.reduce((n, r) => n + (r.crash ? 0 : r.decl.words), 0)} hand-written words`);
    lines.push(...table(rs).map(l => `  ${l}`));
  }
  const failing = [];
  for (const r of results) {
    if (r.crash) { failing.push(`${r.entry}: crashed\n    ${r.crash}`); continue; }
    for (const [k, t] of cols) for (const f of r[k].fails) { const reason = Object.entries(r.known ?? {}).find(([n]) => f.split(" — ")[0].includes(n))?.[1]; failing.push(`${r.entry} · ${t} · ${f}${reason ? `\n    known: ${reason}` : ""}`); }
    for (const m of r.modules ?? []) { if (!m.drafted) failing.push(`${r.entry} · ${m.spec}: rx-declare drafted nothing${m.error ? ` — ${m.error}` : ""}`); for (const x of m.introducedRows ?? []) failing.push(`${r.entry} · whole draft of ${m.spec} · ${x.name}: ${x.introduced} \`any\` the draft wrote where the library has a type (${x.causes.join(", ")})`); }
  }
  for (const m of extra) { if (m.crash) failing.push(`whole draft of ${m.spec}: crashed\n    ${m.crash}`); else { if (!m.drafted) failing.push(`whole draft of ${m.spec}: rx-declare drafted nothing${m.error ? ` — ${m.error}` : ""}`); for (const x of m.introducedRows ?? []) failing.push(`whole draft of ${m.spec} · ${x.name}: ${x.introduced} \`any\` the draft wrote where the library has a type (${x.causes.join(", ")})`); } }
  // what each entry says of its package: why it is not rendered on the server, or not hydrated, and what a module of the
  // app's own is there for (the shapes no row says, 09 MO-8r)
  const notes = results.filter(r => !r.crash && (r.server !== true || typeof r.hydrates === "string" || r.note)).map(r => `  ${r.entry}:${r.server !== true ? ` not rendered on the server — ${r.server}.` : ""}${typeof r.hydrates === "string" ? ` Rendered on the server and mounted in the browser, not hydrated — ${r.hydrates}.` : ""}${r.note ? ` ${r.note[0].toUpperCase()}${r.note.slice(1)}.` : ""}`);
  const off = Object.entries(libs).flatMap(([lib, l]) => Object.entries(l.notOnSolid2 ?? {}).map(([n, v]) => `${n}@${v.version} (solid-js ${v.solid})`));
  // 09 MO-8v: over every module drafted — the words read from the code that runs and the questions still asked, by kind;
  // a module is counted once (two entries may draft the same one)
  const once = [...new Map(rows.filter(x => !x.crash).map(x => [x.spec, x])).values()];
  const kinds = k => { const o = {}; for (const x of once) for (const [n, v] of Object.entries(x[k] ?? {})) o[n] = (o[n] ?? 0) + v; return o; };
  const said = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${v} ${n}`).join(", ") || "none";
  const inferredBy = kinds("inferredBy"), todosBy = kinds("todosBy");
  const kept = results.filter(r => !r.crash);
  const claims = k => kept.reduce((n, r) => n + (r.decl.claims?.[k] ?? 0), 0);
  const contradicted = kept.flatMap(r => (r.decl.contradicted ?? []).map(c => `${r.entry}/${c}`)), unproven = kept.flatMap(r => (r.decl.unproven ?? []).map(c => `${r.entry}/${c}`));
  const total = `Coverage: ${results.length} programs (${kept.filter(r => r.bad.total).length} with one-line mistakes of their own, the rest a good program alone), ${results.filter(ok).length} green; ${rows.filter(x => !x.crash).length} modules drafted whole (${sum(rows, "rows")} rows): ${sum(rows, "vendor")} \`any\` the libraries' own, ${sum(rows, "introduced")} introduced, ${sum(rows, "places")} by place; ${sum(once, "inferred")} words read from the code that runs (${said(inferredBy)}), ${sum(once, "todos")} questions asked (${said(todosBy)}); in the kept rows ${kept.reduce((n, r) => n + (r.decl.inferred ?? 0), 0)} inferred words (${contradicted.length} contradicted, ${unproven.length} words the code does not show), ${claims("total")} claims (one a word of a row): ${claims("code")} proven by the generator, ${claims("run")} held by a probe that fails over a module changed to make the claim false, ${claims("unverified")} the author's own (bench/needed.txt), ${claims("mismatch")} mismatched (${claimsSaid(claimKinds(kept.map(r => r.decl.claims?.by)))}) and ${kept.reduce((n, r) => n + (r.decl.todos ?? 0), 0)} questions; ${results.reduce((n, r) => n + (r.crash ? 0 : r.decl.words), 0)} hand-written words, ${results.reduce((n, r) => n + (r.crash ? 0 : r.decl.inherited), 0)} \`any\` inherited and ${results.reduce((n, r) => n + (r.crash ? 0 : r.decl.introduced), 0)} introduced in the kept rows, ${results.reduce((n, r) => n + (r.crash ? 0 : r.decl.places), 0)} by place`;
  const card = `${total}\n${lines.join("\n")}${failing.length ? `\n\nNot green (${failing.length}):\n${failing.map(f => `  ✗ ${f}`).join("\n")}` : "\n\nAll green."}${notes.length ? `\n\nWhat the entries say of their packages (${notes.length}):\n${notes.join("\n")}` : ""}${off.length ? `\n\nNot on Solid 2, and not tested (the latest release's peer range): ${off.join(", ")}` : ""}`;
  await after;   // (what it says comes after the tasks' card, when both run at once)
  console.log("\n" + card);

  const drafts = Object.fromEntries(extra.filter(m => !m.crash).map(m => [m.spec, { rows: m.rows, vendor: m.vendor, introduced: m.introduced, places: m.places, inferred: m.inferred ?? 0, todos: m.todos ?? 0 }]));
  const snapshot = Object.fromEntries(results.map(r => [r.entry, r.crash ? { crash: true } : { ...Object.fromEntries(cols.map(([k]) => [k, { pass: r[k].pass, total: r[k].total, fails: r[k].fails.map(f => f.split(" — ")[0]) }])), server: r.server === true, hydrates: r.hydrates === true, uses: r.uses, decl: { words: r.decl.words, inferred: r.decl.inferred ?? 0, claims: r.decl.claims, todos: r.decl.todos ?? 0, any: r.decl.any, inherited: r.decl.inherited, introduced: r.decl.introduced, places: r.decl.places }, modules: Object.fromEntries((r.modules ?? []).map(m => [m.spec, { rows: m.rows, vendor: m.vendor, introduced: m.introduced, places: m.places, inferred: m.inferred ?? 0, todos: m.todos ?? 0 }])) }]));
  if (write && !filters.length && !shard) {
    writeFileSync(path.join(root, "coverage.json"), `{"entries": ${compact(snapshot)}, "drafts": ${compact(drafts)}}\n`);
    writeFileSync(path.join(root, "coverage.txt"), card.replaceAll(ws, "bench/.out/ws") + "\n");
    writeFileSync(path.join(root, "audit.txt"), `The coverage entries' declarations, every behaviour word held against what the code shows (09 MO-8w; \`rx-declare --audit <file.d.rx>\`).\n\n${kept.reduce((n, r) => n + (r.decl.inferred ?? 0), 0)} proven: read from the code, counted as inferred, held by rx-verify where the row's claim is one it reads.\n${contradicted.length} contradicted: a run shows the word false (rx-verify).${contradicted.length ? `\n${contradicted.map(c => `  ${c}`).join("\n")}` : ""}\n${unproven.length} the code does not show: a person's word, with the first thing the reading stops at — what to check.\n${unproven.map(c => `  ${c}`).join("\n")}\n`.replaceAll(ws, "bench/.out/ws"));
  }
  const problems = [];
  if (check) {
    const allow = JSON.parse(readFileSync(path.join(here, "any-allowlist.json"), "utf8")).allow.filter(a => a.cover);
    const allowDrafts = allow;
    const recorded = existsSync(path.join(root, "coverage.json")) ? JSON.parse(readFileSync(path.join(root, "coverage.json"), "utf8")) : {};
    const was = recorded.entries ?? {};
    for (const m of extra) {
      if (m.crash) { problems.push(`coverage · whole draft of ${m.spec}: crashed — ${m.crash}`); continue; }
      if (!m.drafted) problems.push(`coverage · ${m.spec}: rx-declare drafted nothing${m.error ? ` (${m.error})` : ""}`);
      for (const x of m.introducedRows ?? []) if (!allowDrafts.some(a => a.cover === "*" && a.draft === m.spec && a.name === x.name && x.introduced <= a.count)) problems.push(`coverage · whole draft of ${m.spec} · ${x.name}: ${x.introduced} \`any\` the draft wrote where the library has a type (09 MO-8q; ${x.causes.join(", ")})`);
      const o = recorded.drafts?.[m.spec]; if (o && m.places > o.places) problems.push(`coverage · whole draft of ${m.spec}: ${m.places} parts by place, was ${o.places} in bench/coverage/coverage.json`);
      if (o?.todos !== undefined && (m.todos ?? 0) > o.todos) problems.push(`coverage · whole draft of ${m.spec}: ${m.todos} questions asked, was ${o.todos} in bench/coverage/coverage.json (09 MO-8v)`);
    }
    for (const r of results) {
      const old = was[r.entry];
      if (r.crash) { problems.push(`coverage ${r.entry}: crashed — ${r.crash}`); continue; }
      for (const [k, t] of cols) for (const f of r[k].fails) {
        const name = f.split(" — ")[0];
        if (old && !old[k]?.fails.includes(name)) problems.push(`coverage ${r.entry} · ${t} · ${name}: was green in bench/coverage/coverage.json`);
        else if (strict && !Object.keys(r.known ?? {}).some(n => name.includes(n))) problems.push(`coverage ${r.entry} · ${t} · ${name}: fails, and the entry's \`known\` gives no reason for it`);
      }
      for (const k of ["words", "todos", "any", "inherited", "introduced", "places"]) if (old?.decl && old.decl[k] !== undefined && r.decl[k] > old.decl[k]) problems.push(`coverage ${r.entry} · ${k} in its .d.rx: ${r.decl[k]}, was ${old.decl[k]} in bench/coverage/coverage.json`);
      // 09 MO-8v: no word read from the code goes back to hand, none is contradicted when run, and a kept row's mark is the draft's
      if (old?.decl?.inferred !== undefined && (r.decl.inferred ?? 0) < old.decl.inferred) problems.push(`coverage ${r.entry} · inferred words in its .d.rx: ${r.decl.inferred ?? 0}, was ${old.decl.inferred} in bench/coverage/coverage.json`);
      { const held = c => (c?.run ?? 0) + (c?.code ?? 0); if (old?.decl?.claims && held(r.decl.claims) < held(old.decl.claims)) problems.push(`coverage ${r.entry} · claims rx-verify holds: ${held(r.decl.claims)}, was ${held(old.decl.claims)} in bench/coverage/coverage.json`); }
      if (old?.decl?.claims && r.decl.claims.unverified > old.decl.claims.unverified) problems.push(`coverage ${r.entry} · words nothing has shown: ${r.decl.claims.unverified}, was ${old.decl.claims.unverified} in bench/coverage/coverage.json (bench/needed.mjs)`);
      for (const c of r.decl.problems ?? []) problems.push(`coverage ${r.entry}/${c}`);
      for (const c of r.decl.contradicted ?? []) problems.push(`coverage ${r.entry}/${c}: a word of the declaration is contradicted by a run of it (the word is false; one read from the code, MO-8v: fix rx-declare's reading)`);
      // 09 MO-8q: no `any` of its own in a kept row, nor in a whole draft, unless bench/any-allowlist.json names it
      for (const f of r.decl.files) for (const x of f.rows) if (!allow.some(a => a.cover === r.entry && a.file === f.file && a.name === x.name && x.introduced <= a.count)) problems.push(`coverage ${r.entry}/${f.file} · ${x.name}: ${x.introduced} \`any\` written where the library has a type (09 MO-8q)`);
      for (const m of r.modules ?? []) {
        if (!m.drafted) problems.push(`coverage ${r.entry} · ${m.spec}: rx-declare drafted nothing${m.error ? ` (${m.error})` : ""}`);
        for (const x of m.introducedRows ?? []) if (!allow.some(a => a.cover === r.entry && a.draft === m.spec && a.name === x.name && x.introduced <= a.count)) problems.push(`coverage ${r.entry} · whole draft of ${m.spec} · ${x.name}: ${x.introduced} \`any\` the draft wrote where the library has a type (09 MO-8q; ${x.causes.join(", ")}): fix rx-declare, or add it to bench/any-allowlist.json (\`cover\`: the entry, \`draft\`: the module)`);
        const o = old?.modules?.[m.spec]; if (o && m.places > o.places) problems.push(`coverage ${r.entry} · whole draft of ${m.spec}: ${m.places} parts by place, was ${o.places} in bench/coverage/coverage.json`);
        if (o?.todos !== undefined && (m.todos ?? 0) > o.todos) problems.push(`coverage ${r.entry} · whole draft of ${m.spec}: ${m.todos} questions asked, was ${o.todos} in bench/coverage/coverage.json (09 MO-8v)`);
      }
    }
    if (!filters.length) {
      // the list is held: every module the libraries list is drafted by an entry, and every one that must be used is
      // imported by an entry's program; a package named "not on Solid 2" still is not (its installed peer range, where
      // it is installed, would say otherwise); an entry recorded and gone is a problem too
      // (what each entry drafts and imports is what its `use.mjs` states; that a draft was made is asked of each, above)
      const drafted = new Set([...had, ...unowned.map(x => x.spec)]), used = new Set(stated.flatMap(e => e.uses));
      const pj = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8")).dependencies;
      for (const [lib, l] of Object.entries(libs)) {
        for (const [pkg, v] of Object.entries(l.packages ?? {})) {
          if (pj[pkg] !== v.version) problems.push(`coverage: ${pkg} is ${pj[pkg] ?? "not"} in bench/package.json, and ${v.version} in bench/coverage/libraries.json`);
          let peer; try { peer = JSON.parse(readFileSync(path.join(ws, "node_modules", pkg, "package.json"), "utf8")); } catch { problems.push(`coverage: ${pkg} is not installed`); continue; }
          const range = peer.peerDependencies?.["solid-js"] ?? peer.dependencies?.["solid-js"];
          if (range && !/(^|[\s|>=^~])2\./.test(range)) problems.push(`coverage: ${pkg}@${peer.version} does not accept solid-js 2 (${range})`);
          for (const m of v.modules) { if (!drafted.has(m)) problems.push(`coverage: no entry drafts ${m} (${lib})`); }
          for (const m of v.use ?? v.modules.slice(0, 1)) if (!used.has(m)) problems.push(`coverage: no entry's program imports ${m} (${lib})`);
        }
      }
      for (const id of Object.keys(was)) if (!all.includes(id)) problems.push(`coverage: ${id} is in bench/coverage/coverage.json and has no entry now`);
    }
  }
  return { problems, results, card };
}
