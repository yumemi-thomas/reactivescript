// MO-8x: a type text a draft writes again and again, written once as an alias of the file and named where it stood. Both
// checkers read a row with each of the file's own aliases written out in its place (compiler/src/parse.rs
// `expand_aliases`), so an alias is a shorter spelling of the same row: the draft keeps one only where the crate reads
// every row of the factored draft exactly as it reads the draft written out (its `rows`: each row's facts and the type
// at each of its places), and TypeScript holds the factored draft against the module as it held the other (13 TY-6).
//
// What is factored is general, not a library's: a type written after a `:` (a parameter's, a field's, a prop's, a
// result's) — the same text in several places (an alias), or the same text but for one type written after a `:` inside
// it (a generic alias of one parameter: `render?: (props: Record<string, any>, state: { open: boolean }) => View` in each
// part of a UI kit is `RenderProp<{ open: boolean }>`). A text that holds a word (`handler`, `ref`, `io`, …) is the row's,
// and is not factored (an alias holds no word); a text that names a row's own type parameter is not either. An alias is
// named as the library names the type, where TypeScript printed it from an alias of the library's (`RenderProp`), else by
// the field it is written for.
"use strict";

const WORD = /(?:^|[^A-Za-z0-9_$.])(?:(?:handler|draft|ref|io|pending)\s+[A-Za-z_$({\["'`]|(?:fails|catches)\()/;
const ROW_END = /^\s+(?:(?:rejects|uses|provides|nests|renders)\(|instantiates\b)/;
const LEAD = /^(?:(?:handler|ref|io|pending)\s+|(?:fails|catches)\([^)]*\)\s*)/;
const MIN_SAVED = 40;   // characters an alias must save, its own row counted
const MIN_TEXT = 16;    // a shorter text is said as well where it stands

function tokenEnd(s, i) {
  const ch = s[i];
  if (ch === '"' || ch === "'" || ch === "`") { for (let j = i + 1; j < s.length; j++) { if (s[j] === "\\") { j++; continue; } if (s[j] === ch) return j + 1; } return s.length; }
  if (s.startsWith("//", i)) { const j = s.indexOf("\n", i); return j < 0 ? s.length : j; }
  if (s.startsWith("/*", i)) { const j = s.indexOf("*/", i + 2); return j < 0 ? s.length : j + 2; }
  return s.startsWith("=>", i) ? i + 2 : i + 1;
}
const nests = (s, i) => "([{<".includes(s[i]) ? 1 : ")]}>".includes(s[i]) ? -1 : 0;
const maskStrings = t => { let out = ""; for (let i = 0; i < t.length;) { const e = tokenEnd(t, i); out += /["'`]/.test(t[i]) ? "_".repeat(e - i) : t.slice(i, e); i = e; } return out; };
const words = t => new Set(maskStrings(t).match(/[A-Za-z_$][\w$]*/g) ?? []);
/** The names a text uses unqualified (`Kit.X` and `import("…").X` are not `X`): what a new alias may not be called. */
const names = t => new Set([...maskStrings(t).matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)].map(m => m[0]));

/** Each type written after a `:` in a row: `[start, end]` of its text, and the name the `:` follows (a field's, a
 *  parameter's; "" for a result). */
function spans(line) {
  const out = [];
  for (let i = 0; i < line.length; i = tokenEnd(line, i)) {
    if (line[i] !== ":") continue;
    let s = i + 1; while (line[s] === " ") s++;
    for (let m; (m = LEAD.exec(line.slice(s)));) s += m[0].length;
    let d = 0, e = s;
    while (e < line.length) {
      const ch = line[e];
      if (d === 0 && (";,)}]".includes(ch) || ROW_END.test(line.slice(e)))) break;
      d += nests(line, e); if (d < 0) break; e = tokenEnd(line, e);
    }
    while (e > s && line[e - 1] === " ") e--;
    const key = /([A-Za-z_$][\w$]*)\s*\??\s*$/.exec(line.slice(0, i))?.[1] ?? "";
    if (e > s) out.push({ start: s, end: e, key: line[i - 1] === ")" ? "" : key });
  }
  return out;
}
/** The type parameters a row declares — its own (`fn f<T>`, `component C<P>`) and a generic function type's in it. */
function tparams(line) {
  const out = new Set();
  for (const m of line.matchAll(/(?:^|[\s:(,|&]|=>|(?:fn|component)\s+[\w$.]+)\s*<([^<>()]*(?:<[^<>]*>[^<>()]*)*)>\s*\(/g)) for (const p of m[1].split(",")) { const n = /^\s*(?:const\s+|in\s+|out\s+)*([A-Za-z_$][\w$]*)/.exec(p)?.[1]; if (n) out.add(n); }
  return out;
}
const pascal = k => k ? k[0].toUpperCase() + k.slice(1) : "";
const isRow = l => /^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const)\s/.test(l);

/** The occurrences of each candidate: a text alone, and a text with one hole. */
function candidates(rows) {
  const plain = new Map(), holed = new Map();
  rows.forEach((line, r) => {
    if (!isRow(line)) return;
    const own = tparams(line), ss = spans(line);
    for (const sp of ss) {
      const text = line.slice(sp.start, sp.end);
      if (text.length < MIN_TEXT || WORD.test(maskStrings(text)) || /^[\w$.]+$/.test(text)) continue;
      const free = words(text);
      if (![...own].some(n => free.has(n))) { const g = plain.get(text) ?? []; g.push({ r, ...sp }); plain.set(text, g); }
      // one type inside it, after a `:`, as its parameter (the rest naming no type parameter of the row)
      for (const h of ss) {
        if (h === sp || h.start < sp.start || h.end > sp.end) continue;
        const tpl = line.slice(sp.start, h.start) + "\u0000" + line.slice(h.end, sp.end);
        const rest = words(tpl.replace("\u0000", " "));
        if ([...own].some(n => rest.has(n))) continue;
        const g = holed.get(tpl) ?? []; g.push({ r, ...sp, hole: line.slice(h.start, h.end) }); holed.set(tpl, g);
      }
    }
  });
  return { plain, holed };
}
/** Occurrences that do not overlap, in row order. */
function disjoint(occ) {
  const by = new Map(); const out = [];
  for (const o of occ) { const xs = by.get(o.r) ?? []; if (xs.some(x => x.start < o.end && o.start < x.end)) continue; xs.push(o); by.set(o.r, xs); out.push(o); }
  return out;
}

/**
 * @param {string[]} rows the draft's lines after its head (rows, their TODO lines, comments)
 * @param {{ hints?: Map<string, string>, taken: Set<string>, limit?: number }} opts `hints`: a text TypeScript printed
 *   from an alias of the library's → that alias's name; `taken`: every name the draft already uses; `limit`: the first so
 *   many aliases (the choices are the same, in the same order)
 * @returns {{ rows: string[], aliases: { name: string, params: string[], body: string, uses: number }[] }}
 */
function factor(rows, opts) {
  rows = [...rows]; const aliases = []; const taken = new Set(opts.taken);
  for (const l of rows) for (const w of names(l)) taken.add(w);
  const nameFor = (texts, keys, generic) => {
    const hinted = new Set(texts.map(t => opts.hints?.get(t)).filter(Boolean));
    const fresh = n => { if (!/^[A-Za-z_$][\w$]*$/.test(n)) return undefined; let x = n, k = 2; while (taken.has(x)) x = `${n}${k++}`; return x; };
    if (hinted.size === 1) { const h = [...hinted][0]; if (!taken.has(h)) return h; }
    const key = [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map())].filter(([k]) => k).sort((a, b) => b[1] - a[1])[0]?.[0];
    return fresh(`${pascal(key ?? "") || "Shared"}${generic ? "Of" : "Type"}`);
  };
  for (let round = 0; round < 200 && aliases.length < (opts.limit ?? Infinity); round++) {
    const { plain, holed } = candidates(rows);
    let best;
    for (const [text, occ0] of plain) {
      const occ = disjoint(occ0); if (occ.length < 2) continue;
      const saved = occ.length * text.length - (text.length + 20 + occ.length * 12);
      if (saved >= MIN_SAVED && (!best || saved > best.saved)) best = { saved, text, occ };
    }
    for (const [tpl, occ0] of holed) {
      const occ = disjoint(occ0); if (occ.length < 2 || new Set(occ.map(o => o.hole)).size < 2) continue;
      const len = tpl.length - 1, holes = occ.reduce((n, o) => n + o.hole.length, 0);
      const saved = occ.length * len + holes - (len + 24 + occ.reduce((n, o) => n + 14 + o.hole.length, 0));
      if (saved >= MIN_SAVED && (!best || saved > best.saved)) best = { saved, tpl, occ };
    }
    if (!best) break;
    const texts = best.occ.map(o => rows[o.r].slice(o.start, o.end));
    if (best.tpl !== undefined) {
      const p = ["T", "S", "U", "V", "W"].find(x => !words(best.tpl.replace("\u0000", " ")).has(x)) ?? "T0";
      const name = nameFor(texts, best.occ.map(o => o.key), true); taken.add(name);
      aliases.push({ name, params: [p], body: best.tpl.replace("\u0000", p), uses: best.occ.length });
      put(rows, best.occ, o => `${name}<${o.hole}>`);
    } else {
      const name = nameFor(texts, best.occ.map(o => o.key), false); taken.add(name);
      aliases.push({ name, params: [], body: best.text, uses: best.occ.length });
      put(rows, best.occ, () => name);
    }
  }
  return { rows, aliases };
}
function put(rows, occ, by) {
  const per = new Map(); for (const o of occ) per.set(o.r, [...(per.get(o.r) ?? []), o]);
  for (const [r, os] of per) { let l = rows[r]; for (const o of os.sort((a, b) => b.start - a.start)) l = l.slice(0, o.start) + by(o) + l.slice(o.end); rows[r] = l; }
}
const aliasRow = a => `export type ${a.name}${a.params.length ? `<${a.params.join(", ")}>` : ""} = ${a.body}`;

/** The crate's reading of a draft's rows, the aliases' own left out: what two drafts are compared by. */
function reading(text, file) {
  const r = require("./rxc.js").rows(file, text);
  if (!r || r.error || !Array.isArray(r.rows)) return undefined;
  return JSON.stringify(r.rows.filter(x => x.kind !== "type").map(({ line, end, ...x }) => x));
}

/**
 * The draft with its repeated types written once, where the crate reads it as it reads `text` and TypeScript holds it as it
 * held `text`; else undefined (and `why` says why). `head`: the lines before the rows; `rows`: the rows' lines.
 */
function factorDraft(head, rows, { hints, file, check, why = [] }) {
  const taken = new Set(); for (const l of [...head, ...rows]) for (const w of names(l)) taken.add(w);
  const f = factor(rows, { hints, taken });
  if (!f.aliases.length) return undefined;
  const text = [...head, ...rows].join("\n") + "\n";
  let want; try { want = reading(text, file); } catch (e) { why.push(`the crate did not read the draft: ${e.message}`); return undefined; }
  if (want === undefined) { why.push("no crate to read the draft with"); return undefined; }
  const build = (fr, as) => [...head, ...fr, ...(as.length ? ["// The types the rows above write more than once, written once (09 MO-8x): a row reads as with each written out in its place", ...as.map(aliasRow)] : [])].join("\n") + "\n";
  // the aliases the crate reads the rows by as before: all of them, else as many as hold, the last one found dropped first
  let aliases = f.aliases;
  for (;;) {
    const fr = factor(rows, { hints, taken, limit: aliases.length }).rows;
    const t = build(fr, aliases);
    let same; try { same = reading(t, file) === want; } catch { same = false; }
    if (same) {
      const bad = check?.(t, head.length, [...fr, ...(aliases.length ? ["// x", ...aliases.map(aliasRow)] : [])]);
      if (!bad?.size) return { text: t, aliases: aliases.map(a => ({ name: a.name, params: a.params, uses: a.uses })) };
      why.push(`TypeScript does not hold the factored draft: ${[...bad].map(([n, w]) => `${n}: ${w}`).join("; ").slice(0, 300)}`);
      return undefined;
    }
    why.push(`the crate reads the rows otherwise with ${aliases.at(-1).name}`);
    aliases = aliases.slice(0, -1);
    if (!aliases.length) return undefined;
  }
}
module.exports = { factorDraft, factor, spans };
