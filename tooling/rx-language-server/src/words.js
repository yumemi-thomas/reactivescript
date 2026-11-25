// The words a JS module's code proves (MO-8v; compiler/src/words, DESIGN.md there): asked of the crate, with what the rows'
// types say of their parameters (row-types.js). One question a module: every export at once.
const { ask } = require("./rxc.js");
const { rowTypes } = require("./row-types.js");

/** @param {{ name: string, kind: "fn" | "component", handlers?: [number, string?][], refs?: string[] }[]} rows
 *  @returns {{ unread?: string, exports: object, contexts: object }} each export's facts, as compiler/src/words/mod.rs says them */
function words(spec, from, rows, contexts = []) {
  const dir = require("node:fs").realpathSync(from), types = rowTypes(spec, dir, rows);
  const r = ask("words", { spec, from: dir, contexts, exports: rows.map(x => ({ name: x.name, kind: x.kind, handlers: x.handlers ?? [], refs: x.refs ?? [], ...(types.get(x.name) ?? { params: [], prims: [], plain: [] }) })) });
  return r.unread !== undefined || r.error ? { unread: r.unread ?? r.error, exports: {}, contexts: {} } : r;
}
/** Every name the module's code exports under some host; undefined where a part of it is not read. */
const names = (spec, from) => ask("words", { spec, from: require("node:fs").realpathSync(from), names: true, exports: [] }).names ?? undefined;
module.exports = { words, names };
