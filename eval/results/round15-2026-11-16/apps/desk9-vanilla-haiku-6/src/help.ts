import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { type Child, type Destroy, type HelpInit, call, el, errMsg, fill } from "./shared";

type Results =
  | { kind: "idle" }
  | { kind: "short"; q: string }
  | { kind: "searching" }
  | { kind: "ok"; q: string }
  | { kind: "error"; message: string };

type Pane =
  | { kind: "none" }
  | { kind: "loading"; id: number }
  | { kind: "ok"; item: Item }
  | { kind: "notfound"; id: number }
  | { kind: "error"; id: number; message: string };

/** The help page. `init` opens it as if the user had typed `init.query` and clicked the hit. */
export function mountHelp(container: HTMLElement, init?: HelpInit): Destroy {
  let alive = true;
  let searchSeq = 0;
  let itemSeq = 0;
  let results: Results = { kind: "idle" };
  let hits: Hit[] = [];
  let selected: number | null = null;
  let pane: Pane = { kind: "none" };

  const queryInput = el("input", {
    testid: "query",
    attrs: { "aria-label": "Search the help", autocomplete: "off", placeholder: "Search the help" },
    onInput: v => runQuery(v),
  });
  const resultsEl = el("div", { testid: "results", cls: "d-results", attrs: { "aria-live": "polite" } });
  const itemEl = el("div", { testid: "item", cls: "d-item", attrs: { "aria-live": "polite" } });

  function runQuery(raw: string): void {
    const q = raw.trim();
    const my = ++searchSeq;
    if (q === "") {
      results = { kind: "idle" };
      hits = [];
    } else if ([...q].length < 2) {
      results = { kind: "short", q };
      hits = [];
    } else {
      results = { kind: "searching" };
      call(() => search(q)).then(
        found => {
          if (!alive || my !== searchSeq) return;
          results = { kind: "ok", q };
          hits = found;
          renderResults();
        },
        e => {
          if (!alive || my !== searchSeq) return;
          results = { kind: "error", message: errMsg(e) };
          hits = [];
          renderResults();
        },
      );
    }
    renderResults();
  }

  function hitEl(h: Hit): HTMLElement {
    const mark = selected === h.id ? "> " : "";
    return el("li", {}, el("button", { testid: "hit", cls: "d-hit", onClick: () => selectHit(h.id) }, `${mark}${h.name}`));
  }

  function renderResults(): void {
    const kids: Child[] = [];
    switch (results.kind) {
      case "short":
        kids.push(el("p", { cls: "d-status" }, `too short: ${results.q}`));
        break;
      case "searching":
        kids.push(el("p", { cls: "d-status" }, "searching…"));
        break;
      case "ok":
        kids.push(el("p", { cls: "d-status" }, `${hits.length} results for ${results.q}`));
        break;
      case "error":
        kids.push(el("p", { cls: "d-error" }, `search failed: ${results.message}`));
        break;
      default:
        break;
    }
    if (results.kind === "searching" || results.kind === "ok") {
      kids.push(el("ul", { cls: "d-plain-list" }, ...hits.map(hitEl)));
    }
    fill(resultsEl, ...kids);
  }

  function selectHit(id: number): void {
    const my = ++itemSeq;
    selected = id;
    pane = { kind: "loading", id };
    renderResults();
    renderPane();
    call(() => fetchItem(id)).then(
      found => {
        if (!alive || my !== itemSeq) return;
        pane = found === null ? { kind: "notfound", id } : { kind: "ok", item: found };
        renderPane();
      },
      e => {
        if (!alive || my !== itemSeq) return;
        pane = { kind: "error", id, message: errMsg(e) };
        renderPane();
      },
    );
  }

  function renderPane(): void {
    const p = pane;
    switch (p.kind) {
      case "none":
        fill(itemEl, el("p", { cls: "d-status" }, "pick a result"));
        break;
      case "loading":
        fill(itemEl, el("p", { cls: "d-status" }, "loading…"));
        break;
      case "ok":
        fill(itemEl, el("h3", {}, p.item.name), el("p", {}, p.item.blurb));
        break;
      case "notfound":
        fill(itemEl, el("p", { cls: "d-error" }, `item ${p.id} not found`));
        break;
      case "error": {
        const id = p.id;
        fill(
          itemEl,
          el("p", { cls: "d-error" }, `failed: ${p.message}`),
          el("button", { testid: "retry-item", cls: "d-small", onClick: () => selectHit(id) }, "retry"),
        );
        break;
      }
    }
  }

  container.replaceChildren(
    el(
      "div",
      { cls: "d-help" },
      el("label", { cls: "d-field" }, "Search", queryInput),
      resultsEl,
      el("section", { cls: "d-pane" }, itemEl),
    ),
  );
  renderResults();
  renderPane();

  if (init !== undefined) {
    queryInput.value = init.query;
    selectHit(init.hitId);
    runQuery(init.query);
  }

  return () => {
    alive = false;
  };
}
