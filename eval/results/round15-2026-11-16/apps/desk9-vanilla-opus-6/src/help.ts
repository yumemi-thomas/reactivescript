import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { Slot, button, errMsg, h, input } from "./dom";

export interface HelpInit {
  query: string;
  hits: Hit[];
  selected: Hit;
}

type SearchState =
  | { kind: "empty" }
  | { kind: "short"; q: string }
  | { kind: "searching" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

type ItemState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ok"; item: Item }
  | { kind: "missing"; id: number }
  | { kind: "error"; message: string };

export function mountHelp(host: HTMLElement, init?: HelpInit): () => void {
  let alive = true;
  let searchGen = 0;
  let status: SearchState = { kind: "empty" };
  let shown: { q: string; hits: Hit[] } | null = null;
  let selectedId: number | null = null;
  let itemGen = 0;
  let item: ItemState = { kind: "none" };

  const query = input("query", "Search help");
  query.setAttribute("type", "search");
  query.setAttribute("placeholder", "Search help…");
  query.addEventListener("input", () => onQuery(query.value));
  const results = new Slot(h("div", { testid: "results", class: "results", attrs: { "aria-live": "polite" } }));
  const pane = new Slot(h("section", { testid: "item", class: "item", attrs: { "aria-live": "polite" } }));
  host.append(h("div", { class: "help" }, query, h("div", { class: "cols" }, h("div", { class: "col" }, results.el), pane.el)));

  function onQuery(q: string): void {
    const gen = ++searchGen;
    const length = [...q].length;
    if (length === 0) {
      status = { kind: "empty" };
      shown = null;
    } else if (length < 2) {
      status = { kind: "short", q };
      shown = null;
    } else {
      status = { kind: "searching" };
      api.search(q).then(
        hits => {
          if (!alive || gen !== searchGen) return;
          status = { kind: "ok" };
          shown = { q, hits };
          render();
        },
        e => {
          if (!alive || gen !== searchGen) return;
          status = { kind: "error", message: errMsg(e) };
          shown = null;
          render();
        },
      );
    }
    render();
  }

  function selectHit(hit: Hit): void {
    selectedId = hit.id;
    loadItem(hit.id);
  }

  function loadItem(id: number): void {
    const gen = ++itemGen;
    item = { kind: "loading" };
    render();
    api.fetchItem(id).then(
      it => {
        if (!alive || gen !== itemGen) return;
        item = it === null ? { kind: "missing", id } : { kind: "ok", item: it };
        render();
      },
      e => {
        if (!alive || gen !== itemGen) return;
        item = { kind: "error", message: errMsg(e) };
        render();
      },
    );
  }

  function render(): void {
    if (!alive) return;
    results.render(JSON.stringify([status, shown, selectedId]), () => {
      const out: (Node | string)[] = [];
      if (status.kind === "short") out.push(h("p", { class: "muted" }, `too short: ${status.q}`));
      if (status.kind === "error") out.push(h("p", { class: "error" }, `search failed: ${status.message}`));
      if (status.kind === "searching") out.push(h("p", { class: "muted" }, "searching…"));
      if (shown) {
        const { q, hits } = shown;
        out.push(
          h("p", {}, `${hits.length} results for ${q}`),
          h(
            "ul",
            { class: "hits" },
            hits.map(hit =>
              h(
                "li",
                { testid: "hit", class: hit.id === selectedId ? "selected" : undefined, onclick: () => selectHit(hit) },
                h("button", { type: "button", class: "link", attrs: hit.id === selectedId ? { "aria-current": "true" } : {} },
                  `${hit.id === selectedId ? "> " : ""}${hit.name}`),
              ),
            ),
          ),
        );
      }
      return out;
    });
    pane.render(JSON.stringify([item, selectedId]), () => {
      switch (item.kind) {
        case "none":
          return [h("p", { class: "muted" }, "pick a result")];
        case "loading":
          return [h("p", { class: "muted" }, "loading…")];
        case "ok":
          return [h("h2", {}, item.item.name), h("p", {}, item.item.blurb)];
        case "missing":
          return [h("p", { class: "error" }, `item ${item.id} not found`)];
        case "error": {
          const id = selectedId;
          return [
            h("p", { class: "error" }, `failed: ${item.message}`),
            button("retry-item", "retry", () => {
              if (id !== null) loadItem(id);
            }),
          ];
        }
      }
    });
  }

  if (init) {
    query.value = init.query;
    status = { kind: "ok" };
    shown = { q: init.query, hits: init.hits };
    selectHit(init.selected);
  }
  render();

  return () => {
    alive = false;
  };
}
