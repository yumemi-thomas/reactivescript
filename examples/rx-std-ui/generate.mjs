// Writes plain .rx parts from core's own schema (schemaOf, and what each slot defines), and compares them with the hand-written
// ones, component by component. node generate.mjs [--write]: generated/<name>.rx
import { schemaOf } from "@ui-sdk/core/renderer"; import { tabs } from "@ui-sdk/core/tabs"; import { toggle, toggleGroup } from "@ui-sdk/core/toggle"; import { dialog } from "@ui-sdk/core/dialog"; import fs from "node:fs"; import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const pascal = (n) => n.replace(/(^|-)(\w)/g, (_, _d, c) => c.toUpperCase());
const on = { click: "Click", keydown: "KeyDown", keyup: "KeyUp", pointerenter: "PointerEnter", pointerleave: "PointerLeave", focusin: "FocusIn", focusout: "FocusOut" };
const events = (def) => [...Object.keys(def.on ?? {}), ...(typeof def.press === "function" && !def.on?.click ? ["click"] : [])].sort((a, b) => Object.keys(on).indexOf(a) - Object.keys(on).indexOf(b));
const kind = (s) => typeof s === "string" ? s : s.kind ?? "value";
function element(tag, i) {
  const E = "{ ...attrs, ...on_, class: classOf(props.class, now), style: styleOf(props.style, now, attrs.style) }";
  return `${i}{if render != undefined {\n${i}  all = elementProps(rest, ${E}, peek props, peek now)\n${i}  {viewOf(render(all, now))}\n${i}} else {\n${i}  <${tag} {...rest} {...attrs} {...on_} class={classOf(props.class, now)} style={styleOf(props.style, now, attrs.style)}>{viewOf(props.children, now)}</${tag}>\n${i}}}\n`;
}
function binding(def, i) {
  const list = ["ref: (e: Element) => { bind(e); give(user, e) }", ...events(def).map((t) => `on${on[t]}: (e: Event) => { fire(part, "${t}", e, props.on${on[t]}) }`)];
  return `${i}bind = binder(part)\n${i}on_ = own(${list.length === 1 ? `{ ${list[0]} }` : `{\n${list.map((l) => i + "  " + l).join(",\n")}\n${i}}`})\n`;
}
function part(name, scope, slot, tag, def) {
  const schema = def.props ?? {}, ids = Object.keys(schema).filter((k) => kind(schema[k]) === "id"), names = Object.keys(schema).filter((k) => !ids.includes(k) && typeof schema[k] !== "object");
  const local = (n) => n === "action" ? "action: action_" : n, named = [...ids.map((k) => `${k}: props.${k} ?? ${k}`), ...names.map((n) => `${n}: ${n === "action" ? "action_" : n}`)].join(", ");
  let s = `export component ${name}(props: ${name}Props) {\n  { ${[...names.map(local), "render", "ref: user"].join(", ")}, ...rest } = props\n  scope = use ${scope}\n` + ids.map((k) => `  ${k} = uniqueId()\n`).join(""); const n = named ? `{ ${named} }` : "{}";
  if (def.present) s += `  named = ${n}\n  { part, attrs, now, tick } = usePart(scope.it, "${slot}", named, rest, scope.options)\n  present = presentOf(part, named, scope.options, tick)\n  {if present {\n${binding(def, "    ")}${element(tag, "    ")}  }}\n`;
  else s += `  { part, attrs, now } = usePart(scope.it, "${slot}", ${n}, rest, scope.options)\n${binding(def, "  ")}${element(tag, "  ")}`;
  return s + "}\n";
}
function rootOf(name, scope, primitive, variable, tag, slot = "root") {
  const options = Object.keys(schemaOf(primitive).options).filter((o) => !["group", "toolbar", "debug"].includes(o)).concat("debug");
  return `export component ${name}(props: ${name}Props) {\n  { ${options.join(", ")}, render, ref: user, ...rest } = props\n  options = { ${options.map((o) => `${o}: ${o}`).join(", ")} }\n  it = create(${variable}, options)\n  effect (it, options) { setOptions($0, $1) }\n  { part, attrs, now } = usePart(it, "${slot}", {}, rest, options)\n${binding(primitive.slots[slot], "  ")}  provide ${scope} = { it: it, options: options }\n${element(tag, "  ")}}\n`;
}
const files = {
  tabs: [rootOf("Tabs", "tabs", tabs, "primitive", "div"), ...Object.entries({ list: "div", tab: "button", "tab-icon": "span", indicator: "span", panel: "div" }).map(([s, t]) => part("Tabs" + pascal(s), "tabs", s, t, tabs.slots[s]))],
  toggle: [rootOf("Toggle", "root", toggle, "toggle", "button"), part("ToggleIcon", "root", "icon", "span", toggle.slots.icon), rootOf("ToggleGroup", "group", toggleGroup, "toggleGroup", "div", "group")],
  dialog: Object.entries({ trigger: "button", backdrop: "div", content: "div", title: "h2", description: "p", close: "button", shortcut: "span" }).map(([s, t]) => part("Dialog" + pascal(s), "dialog", s, t, dialog.slots[s])),
};
const split = (t) => Object.fromEntries((t.match(/^(export )?component \w+[\s\S]*?^}\n/gm) ?? []).map((c) => [/component (\w+)/.exec(c)[1], c.replace("export ", "").trim()]));
for (const [f, parts] of Object.entries(files)) {
  const hand = split(fs.readFileSync(path.join(here, "src", f + ".rx"), "utf8")), made = split(parts.join("\n"));
  for (const [n, h] of Object.entries(hand)) { const m = made[n]; if (!m) { console.log(`${f}: ${n}: not generated (${h.split("\n").length} lines by hand)`); continue; } const a = h.split("\n"), b = new Set(m.split("\n")), c = new Set(a); const add = a.filter((l) => !b.has(l)).length, less = m.split("\n").filter((l) => !c.has(l)).length; console.log(`${f}: ${n}: ${h === m ? "the same text" : `${add} lines only by hand, ${less} only generated, of ${a.length}`}`); if (process.argv.includes("-v") && h !== m) { for (const l of a) if (!b.has(l)) console.log("   hand " + l.slice(0, 200)); for (const l of m.split("\n")) if (!c.has(l)) console.log("   gen  " + l.slice(0, 200)); } }
  if (process.argv.includes("--write")) { fs.mkdirSync(here + "/generated", { recursive: true }); const head = fs.readFileSync(path.join(here, "src", f + ".rx"), "utf8").split(/^export component/m)[0]; fs.writeFileSync(path.join(here, "generated", f + ".rx"), head + parts.join("\n")); }
}
console.log("dialog's options by the schema:", Object.keys(schemaOf(dialog).options).join(" "));
