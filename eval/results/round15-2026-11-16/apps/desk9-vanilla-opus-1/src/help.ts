import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { button, errMsg, h, input } from "./dom.js";
import type { Page } from "./dom.js";

export interface HelpPreset {
  query: string;
  hits: Hit[];
  hit: Hit;
}

interface ItemSel {
  id: number;
  tok: number;
  state:
    | { status: "loading" }
    | { status: "ok"; item: Item }
    | { status: "missing" }
    | { status: "error"; error: string };
}

export function helpPage(preset?: HelpPreset): Page {
  let alive = true;
  let searchTok = 0;
  let searching = false;
  let short: string | null = null;
  let shown: { q: string; hits: Hit[] } | null = null;
  let searchError: string | null = null;
  let sel: ItemSel | null = null;

  const queryInput = input("query", "", "Search help");
  queryInput.placeholder = "Search help";
  queryInput.type = "search";
  const resultsEl = h("div", { testid: "results", cls: "results", attrs: { "aria-live": "polite" } });
  const itemEl = h("div", { testid: "item", cls: "item" });
  const el = h("section", { cls: "page help" }, queryInput, h("div", { cls: "columns" }, resultsEl, itemEl));

  queryInput.addEventListener("input", () => setQuery(queryInput.value));

  function clearSel(): void {
    sel = null;
  }

  function setQuery(q: string): void {
    const tok = ++searchTok;
    searchError = null;
    if (q.length === 0) {
      searching = false;
      short = null;
      shown = null;
      clearSel();
    } else if (q.length < 2) {
      searching = false;
      short = q;
      shown = null;
      clearSel();
    } else {
      short = null;
      searching = true;
      api.search(q).then(
        hits => {
          if (!alive || tok !== searchTok) return;
          const list = Array.isArray(hits) ? hits : [];
          searching = false;
          shown = { q, hits: list };
          if (sel && !list.some(x => x.id === sel!.id)) clearSel();
          render();
        },
        e => {
          if (!alive || tok !== searchTok) return;
          searching = false;
          shown = null;
          searchError = errMsg(e);
          render();
        },
      );
    }
    render();
  }

  function select(hit: Hit): void {
    const s: ItemSel = { id: hit.id, tok: 0, state: { status: "loading" } };
    sel = s;
    loadItem(s);
  }

  function loadItem(s: ItemSel): void {
    const tok = ++s.tok;
    s.state = { status: "loading" };
    render();
    api.fetchItem(s.id).then(
      item => {
        if (!alive || sel !== s || tok !== s.tok) return;
        s.state = item ? { status: "ok", item } : { status: "missing" };
        render();
      },
      e => {
        if (!alive || sel !== s || tok !== s.tok) return;
        s.state = { status: "error", error: errMsg(e) };
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    const nodes: Node[] = [];
    if (short !== null) nodes.push(h("p", { cls: "muted", text: `too short: ${short}` }));
    if (searching) nodes.push(h("p", { cls: "muted", text: "searching…" }));
    if (searchError !== null) nodes.push(h("p", { cls: "error", text: `search failed: ${searchError}` }));
    if (shown) {
      nodes.push(h("p", { cls: "count", text: `${shown.hits.length} results for ${shown.q}` }));
      const ul = h("ul", { cls: "hits" });
      for (const hit of shown.hits) {
        const selected = !!sel && sel.id === hit.id;
        const li = h("li", {
          testid: "hit",
          cls: selected ? "hit selected" : "hit",
          text: `${selected ? "> " : ""}${hit.name}`,
          attrs: { tabindex: "0", role: "button", "aria-pressed": String(selected) },
          onClick: () => select(hit),
        });
        li.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(hit);
          }
        });
        ul.append(li);
      }
      nodes.push(ul);
    }
    resultsEl.replaceChildren(...nodes);

    if (!sel) itemEl.replaceChildren(h("p", { cls: "muted", text: "pick a result" }));
    else {
      const s = sel;
      const st = s.state;
      if (st.status === "loading") itemEl.replaceChildren(h("p", { cls: "muted", text: "loading…" }));
      else if (st.status === "missing") itemEl.replaceChildren(h("p", { cls: "error", text: `item ${s.id} not found` }));
      else if (st.status === "error")
        itemEl.replaceChildren(
          h("p", { cls: "error", text: `failed: ${st.error}` }),
          button("retry-item", "retry", () => {
            if (sel === s) loadItem(s);
          }),
        );
      else itemEl.replaceChildren(h("h2", { text: st.item.name }), h("p", { text: st.item.blurb }));
    }
  }

  if (preset) {
    queryInput.value = preset.query;
    searchTok++;
    if (preset.query.length >= 2) shown = { q: preset.query, hits: preset.hits };
    select(preset.hit);
  }
  render();

  return {
    el,
    dispose() {
      alive = false;
    },
  };
}
