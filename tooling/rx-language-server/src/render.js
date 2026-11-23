// What rx-verify and `rx-declare --run` mount with: Solid's browser build where there is a document (`--dom`,
// happy-dom's globals), else a universal renderer over plain nodes. One place, so every check renders alike.

/** Plain nodes for @solidjs/universal: enough of a tree for a component to render into. */
const nodes = () => ({ createElement: t => ({ t, c: [] }), createTextNode: x => ({ x }), replaceText: (a, v) => { a.x = v; }, isTextNode: a => "x" in a, setProperty() {}, insertNode: (p, a) => { (p.c ??= []).push(a); a.p = p; }, removeNode: (p, a) => { p.c = (p.c ?? []).filter(y => y !== a); }, getParentNode: a => a.p, getFirstChild: a => a.c?.[0], getNextSibling: a => { const c = a.p?.c ?? []; return c[c.indexOf(a) + 1]; } });
/** Render `view` and hand back its dispose. `resolve(spec)` gives a package's URL as the project installs it. Throws
 *  what the view throws as it renders, and MODULE_NOT_FOUND where the project has no @solidjs/universal. */
async function render(view, resolve) {
  if (typeof document !== "undefined" && document.body) { const web = await import(resolve("@solidjs/web")); const el = document.createElement("div"); document.body.appendChild(el); return web.render(view, el); }
  const { createRenderer } = await import(resolve("@solidjs/universal"));
  return createRenderer(nodes()).render(view, { t: "root", c: [] });
}
/** Time for what was rendered to settle: Solid's queue flushed, `rounds` times, `ms` apart. */
async function settle(s, rounds = 10, ms = 20) { for (let i = 0; i < rounds; i++) { s.flush?.(); await new Promise(r => setTimeout(r, ms)); } }
/** The console's warnings and errors, kept instead of printed until `restore()`: a library that says a missing
 *  provider with a warning says it here. */
function hushed() {
  const warned = [], saved = [console.warn, console.error];
  console.warn = console.error = (...a) => { warned.push(a.map(String).join(" ")); };
  return { warned, restore: () => { [console.warn, console.error] = saved; } };
}
/** Whether a project lacks the renderer a mount needs (and nothing else went wrong). */
const noRenderer = e => e?.code === "MODULE_NOT_FOUND" && /@solidjs\/universal/.test(String(e.message));

module.exports = { render, settle, hushed, noRenderer };
