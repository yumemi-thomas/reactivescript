import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { errMsg, fill, h, textInput } from "./dom.js";

export interface HelpStart {
  query: string;
  hits: Hit[];
  hit: Hit;
}

type Shown = { kind: "hits"; q: string; hits: Hit[] } | { kind: "error"; message: string } | null;

type ItemState =
  | { status: "none" }
  | { status: "loading"; id: number; token: number }
  | { status: "loaded"; id: number; token: number; item: Item }
  | { status: "notfound"; id: number; token: number }
  | { status: "error"; id: number; token: number; message: string };

export function mountHelp(root: HTMLElement, start?: HelpStart): () => void {
  let alive = true;
  let tick = 0;

  let query = "";
  /** what the query asks for: nothing, too short, or a search */
  let mode: "empty" | "short" | "search" = "empty";
  let searchToken = 0;
  let searching = false;
  let shown: Shown = null;
  let selectedId: number | null = null;
  let item: ItemState = { status: "none" };

  const input = textInput("query");
  input.placeholder = "Search help";
  input.setAttribute("aria-label", "Search help");
  const results = h("div", { testid: "results", cls: "results" });
  const pane = h("div", { testid: "item", cls: "item" });
  const page = h("div", { cls: "help-page" }, input, results, pane);
  root.append(page);

  input.addEventListener("input", () => setQuery(input.value));

  function setQuery(q: string): void {
    if (q === query) return;
    query = q;
    const token = ++tick;
    searchToken = token;
    if (q.length === 0) {
      mode = "empty";
      searching = false;
      shown = null;
    } else if (q.length === 1) {
      mode = "short";
      searching = false;
      shown = null;
    } else {
      mode = "search";
      searching = true;
      if (shown && shown.kind === "error") shown = null;
      api.search(q).then(
        hits => {
          if (!alive || searchToken !== token) return;
          searching = false;
          shown = { kind: "hits", q, hits: Array.isArray(hits) ? hits.map(x => ({ ...x })) : [] };
          render();
        },
        e => {
          if (!alive || searchToken !== token) return;
          searching = false;
          shown = { kind: "error", message: errMsg(e) };
          render();
        },
      );
    }
    render();
  }

  function selectHit(hit: Hit): void {
    if (selectedId === hit.id && item.status !== "none" && item.status !== "error") return;
    selectedId = hit.id;
    loadItem(hit.id);
  }

  function loadItem(id: number): void {
    const token = ++tick;
    item = { status: "loading", id, token };
    render();
    api.fetchItem(id).then(
      it => {
        if (!alive || item.status === "none" || item.token !== token) return;
        item = it ? { status: "loaded", id, token, item: { ...it } } : { status: "notfound", id, token };
        render();
      },
      e => {
        if (!alive || item.status === "none" || item.token !== token) return;
        item = { status: "error", id, token, message: errMsg(e) };
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    if (mode === "empty") fill(results);
    else if (mode === "short") fill(results, `too short: ${query}`);
    else {
      const parts: (Node | null)[] = [];
      if (searching) parts.push(h("div", { cls: "searching", text: "searching…" }));
      if (shown && shown.kind === "error") parts.push(h("div", { cls: "error", text: `search failed: ${shown.message}` }));
      if (shown && shown.kind === "hits") {
        const sh = shown;
        parts.push(h("div", { cls: "count", text: `${sh.hits.length} results for ${sh.q}` }));
        parts.push(
          h(
            "ul",
            {},
            ...sh.hits.map(hit => {
              const li = h("li", {
                testid: "hit",
                cls: hit.id === selectedId ? "hit selected" : "hit",
                text: hit.id === selectedId ? `> ${hit.name}` : hit.name,
                onClick: () => selectHit(hit),
              });
              li.tabIndex = 0;
              li.addEventListener("keydown", ev => {
                if (ev.key === "Enter") selectHit(hit);
              });
              return li;
            }),
          ),
        );
      }
      fill(results, ...parts);
    }

    switch (item.status) {
      case "none":
        fill(pane, "pick a result");
        break;
      case "loading":
        fill(pane, "loading…");
        break;
      case "loaded":
        fill(pane, h("h3", { text: item.item.name }), h("p", { text: item.item.blurb }));
        break;
      case "notfound":
        fill(pane, `item ${item.id} not found`);
        break;
      case "error": {
        const id = item.id;
        fill(
          pane,
          h("div", { text: `failed: ${item.message}` }),
          h("button", { testid: "retry-item", text: "retry", onClick: () => loadItem(id) }),
        );
        break;
      }
    }
  }

  if (start) {
    query = start.query;
    input.value = start.query;
    if (query.length === 0) mode = "empty";
    else if (query.length === 1) mode = "short";
    else {
      mode = "search";
      shown = { kind: "hits", q: query, hits: start.hits.map(x => ({ ...x })) };
    }
    selectedId = start.hit.id;
    loadItem(start.hit.id);
  }
  render();

  return () => {
    alive = false;
    page.remove();
  };
}
