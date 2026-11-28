import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import type { HelpInit, Page } from "./app.js";
import { errorMessage, h, nextSeq, textInput } from "./dom.js";

type SearchState =
  | { kind: "empty" }
  | { kind: "short"; q: string }
  | { kind: "searching"; q: string; seq: number }
  | { kind: "ok"; q: string; hits: Hit[] }
  | { kind: "error"; q: string; msg: string };

type ItemState =
  | { kind: "none" }
  | { kind: "loading"; id: number; seq: number }
  | { kind: "ok"; id: number; item: Item }
  | { kind: "notfound"; id: number }
  | { kind: "error"; id: number; msg: string };

export function helpPage(init?: HelpInit): Page {
  let alive = true;
  let search: SearchState = { kind: "empty" };
  let shown: { q: string; hits: Hit[] } | null = null;
  let searchSeq = 0;
  let selectedId: number | null = null;
  let item: ItemState = { kind: "none" };

  const query = textInput("query", "Search help");
  query.setAttribute("placeholder", "search help");
  query.type = "search";
  const results = h("div", { testid: "results", cls: "results", attrs: { "aria-live": "polite" } });
  const pane = h("section", { testid: "item", cls: "item", attrs: { "aria-live": "polite" } });
  const el = h("div", { cls: "help" }, h("label", { cls: "field" }, "Search ", query), h("div", { cls: "columns" }, results, pane));

  function runQuery(q: string): void {
    searchSeq = nextSeq();
    if (q === "") {
      search = { kind: "empty" };
      shown = null;
    } else if ([...q].length < 2) {
      search = { kind: "short", q };
      shown = null;
    } else {
      const seq = searchSeq;
      search = { kind: "searching", q, seq };
      api.search(q).then(
        hits => {
          if (!alive || seq !== searchSeq) return;
          search = { kind: "ok", q, hits };
          shown = { q, hits };
          renderResults();
        },
        e => {
          if (!alive || seq !== searchSeq) return;
          search = { kind: "error", q, msg: errorMessage(e) };
          shown = null;
          renderResults();
        },
      );
    }
    renderResults();
  }

  function selectHit(id: number): void {
    selectedId = id;
    loadItem(id);
    renderResults();
  }

  function loadItem(id: number): void {
    const seq = nextSeq();
    item = { kind: "loading", id, seq };
    renderItem();
    api.fetchItem(id).then(
      it => {
        if (!alive || item.kind !== "loading" || item.seq !== seq) return;
        item = it ? { kind: "ok", id, item: it } : { kind: "notfound", id };
        renderItem();
      },
      e => {
        if (!alive || item.kind !== "loading" || item.seq !== seq) return;
        item = { kind: "error", id, msg: errorMessage(e) };
        renderItem();
      },
    );
  }

  function renderResults(): void {
    const nodes: Node[] = [];
    if (search.kind === "short") nodes.push(h("p", { cls: "muted", text: `too short: ${search.q}` }));
    if (search.kind === "searching") nodes.push(h("p", { cls: "muted", text: "searching…" }));
    if (search.kind === "error") nodes.push(h("p", { cls: "error", text: `search failed: ${search.msg}` }));
    if (shown && (search.kind === "ok" || search.kind === "searching")) {
      nodes.push(h("p", { cls: "count", text: `${shown.hits.length} results for ${shown.q}` }));
      const ul = h("ul", { cls: "hits" });
      for (const hit of shown.hits) {
        const selected = hit.id === selectedId;
        const li = h("li", {
          testid: "hit",
          cls: selected ? "hit selected" : "hit",
          text: selected ? `> ${hit.name}` : hit.name,
          attrs: { role: "button", tabindex: "0", "aria-pressed": String(selected) },
          onClick: () => selectHit(hit.id),
        });
        li.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectHit(hit.id);
          }
        });
        ul.append(li);
      }
      nodes.push(ul);
    }
    results.replaceChildren(...nodes);
  }

  function renderItem(): void {
    switch (item.kind) {
      case "none":
        pane.replaceChildren(h("p", { cls: "muted", text: "pick a result" }));
        break;
      case "loading":
        pane.replaceChildren(h("p", { cls: "muted", text: "loading…" }));
        break;
      case "ok":
        pane.replaceChildren(h("h2", { text: item.item.name }), h("p", { text: item.item.blurb }));
        break;
      case "notfound":
        pane.replaceChildren(h("p", { cls: "error", text: `item ${item.id} not found` }));
        break;
      case "error": {
        const id = item.id;
        pane.replaceChildren(
          h("p", { cls: "error", text: `failed: ${item.msg}` }),
          h("button", { testid: "retry-item", text: "retry", onClick: () => loadItem(id) }),
        );
        break;
      }
    }
  }

  query.addEventListener("input", () => runQuery(query.value));

  if (init) {
    query.value = init.query;
    searchSeq = nextSeq();
    if ([...init.query].length >= 2) {
      search = { kind: "ok", q: init.query, hits: init.hits };
      shown = { q: init.query, hits: init.hits };
    } else {
      runQuery(init.query);
    }
    selectedId = init.selectedId;
    loadItem(init.selectedId);
  }
  renderResults();
  renderItem();

  return {
    el,
    refresh() {},
    dispose() {
      alive = false;
    },
  };
}
