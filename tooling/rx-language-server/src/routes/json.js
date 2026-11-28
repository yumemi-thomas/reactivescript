// A JSON tree another host's own tooling writes.
const fs = require("node:fs");
const path = require("node:path");
const { componentsOf } = require("./common.js");

/** A tree another host's tooling wrote: `[{ file, component?, path?, id?, children? }]`, files against the JSON's folder. */
function readJson(source, text) {
  const problems = []; let data;
  try { data = JSON.parse(text); } catch (e) { return { kind: "json", nodes: [], through: [], imports: [], problems: [`${source}: ${e.message}`] }; }
  const node = n => { const file = path.resolve(path.dirname(source), String(n.file)); const c = componentsOf(file); const name = n.component ?? c.dflt; if (!name || !c.all.includes(name)) problems.push(`${n.file} exports no component ${n.component ?? "by default"}`); return { file, name, route: file, id: n.id, path: n.path, children: [].concat(n.children ?? []).map(node) }; };
  return { kind: "json", nodes: [].concat(data.routes ?? data).map(node), through: [].concat(data.through ?? []), imports: [].concat(data.imports ?? []), problems };
}

module.exports = { takes: source => source.endsWith(".json"), read: readJson };
