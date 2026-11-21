// The help page: a search box, its results, and the item pane for the selected hit.

import { errMsg, h } from "./dom";
import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";

export interface HelpPreset {
  query: string;
  id: number;
}

type ItemState =
  | { s: "none" }
  | { s: "loading" }
  | { s: "ok"; v: Item }
  | { s: "nf"; id: number }
  | { s: "err"; m: string };

/**
 * Mounts the help page into `container`. With a preset (a related hit opened from an issue),
 * the query is searched and the preset hit is selected at once; otherwise the page starts empty.
 */
export function mountHelp(container: HTMLElement, preset?: HelpPreset): () => void {
  let statusText = "";
  let hits: Hit[] = [];
  let lastQuery: string | null = null;
  let searchTok: object = {};
  let selected: number | null = null;
  let item: ItemState = { s: "none" };
  let itemTok: object = {};

  const queryInput = h("input", {
    testid: "query",
    type: "text",
    placeholder: "Search help",
    oninput: () => runSearch(queryInput.value),
  });
  const statusEl = h("p", { cls: "status" });
  const hitsEl = h("ul", { cls: "hits" });
  const resultsEl = h("div", { testid: "results" }, statusEl, hitsEl);
  const itemEl = h("div", { testid: "item", cls: "item" });

  container.replaceChildren(
    h("div", { cls: "help" }, h("label", {}, "Help search ", queryInput), resultsEl, itemEl),
  );

  function runSearch(q: string): void {
    if (q === lastQuery) return;
    lastQuery = q;
    const tok = {};
    searchTok = tok;
    if (q.length === 0) {
      statusText = "";
      hits = [];
    } else if (q.length === 1) {
      statusText = `too short: ${q}`;
      hits = [];
    } else {
      // Results already on screen stay until the new ones replace them.
      statusText = "searching…";
      renderResults();
      search(q).then(
        (found) => {
          if (searchTok !== tok) return;
          statusText = `${found.length} results for ${q}`;
          hits = found;
          renderResults();
        },
        (e: unknown) => {
          if (searchTok !== tok) return;
          statusText = `search failed: ${errMsg(e)}`;
          hits = [];
          renderResults();
        },
      );
      return;
    }
    renderResults();
  }

  function renderResults(): void {
    statusEl.textContent = statusText;
    hitsEl.replaceChildren(
      ...hits.map((hit) =>
        h("li", {
          testid: "hit",
          text: `${hit.id === selected ? "> " : ""}${hit.name}`,
          attrs: { role: "button", tabindex: "0" },
          onclick: () => select(hit.id),
          onenter: () => select(hit.id),
        }),
      ),
    );
  }

  function select(id: number): void {
    selected = id;
    renderResults();
    loadItem();
  }

  function loadItem(): void {
    if (selected === null) {
      item = { s: "none" };
      renderItem();
      return;
    }
    const id = selected;
    const tok = {};
    itemTok = tok;
    item = { s: "loading" };
    renderItem();
    fetchItem(id).then(
      (v) => {
        if (itemTok !== tok) return;
        item = v === null ? { s: "nf", id } : { s: "ok", v };
        renderItem();
      },
      (e: unknown) => {
        if (itemTok !== tok) return;
        item = { s: "err", m: errMsg(e) };
        renderItem();
      },
    );
  }

  function renderItem(): void {
    const st = item;
    switch (st.s) {
      case "none":
        itemEl.replaceChildren(h("p", { text: "pick a result" }));
        break;
      case "loading":
        itemEl.replaceChildren(h("p", { text: "loading…" }));
        break;
      case "nf":
        itemEl.replaceChildren(h("p", { text: `item ${st.id} not found` }));
        break;
      case "err":
        itemEl.replaceChildren(
          h("p", { cls: "error", text: `failed: ${st.m}` }),
          h("button", { testid: "retry-item", text: "retry", onclick: () => loadItem() }),
        );
        break;
      case "ok":
        itemEl.replaceChildren(h("h3", { text: st.v.name }), h("p", { text: st.v.blurb }));
        break;
    }
  }

  if (preset) {
    queryInput.value = preset.query;
    runSearch(preset.query);
    select(preset.id);
  } else {
    renderResults();
    renderItem();
  }

  return () => {
    // Late answers from a discarded page must not touch anything.
    searchTok = {};
    itemTok = {};
  };
}
