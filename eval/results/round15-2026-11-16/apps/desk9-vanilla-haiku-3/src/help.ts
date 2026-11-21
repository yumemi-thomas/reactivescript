import * as api from "./api.js";
import type { Hit, Item } from "./api.js";
import { type Child, content, errorText, h, setText, watchText } from "./dom.js";

export interface HelpInit {
  /** Typed into the query and searched, as if the user had typed it. */
  query: string;
  /** The hit to select once the page is up. */
  selectId: number;
}

type Results =
  | { kind: "empty" }
  | { kind: "short"; q: string }
  | { kind: "searching"; hits: Hit[] }
  | { kind: "done"; q: string; hits: Hit[] }
  | { kind: "failed"; message: string };

type ItemView =
  | { kind: "none" }
  | { kind: "loading"; id: number }
  | { kind: "found"; item: Item }
  | { kind: "missing"; id: number }
  | { kind: "failed"; id: number; message: string };

/** The help page. Discarded when the user leaves it; dispose() makes later answers no-ops. */
export class HelpPage {
  private alive = true;
  private searchGen = 0;
  private itemGen = 0;
  private results: Results = { kind: "empty" };
  private selectedId: number | null = null;
  private item: ItemView = { kind: "none" };
  private readonly queryInput: HTMLInputElement;
  private readonly resultsEl: HTMLElement;
  private readonly itemEl: HTMLElement;

  constructor(root: HTMLElement, init?: HelpInit) {
    this.queryInput = h("input", { testid: "query", placeholder: "Search the help" });
    watchText(this.queryInput, (value) => this.onQuery(value));
    this.resultsEl = h("div", { testid: "results" });
    this.itemEl = h("div", { testid: "item" });
    root.replaceChildren(h("section", {}, this.queryInput, this.resultsEl, this.itemEl));
    this.renderResults();
    this.renderItem();
    if (init) {
      setText(this.queryInput, init.query);
      this.onQuery(init.query);
      this.selectHit(init.selectId);
    }
  }

  dispose(): void {
    this.alive = false;
  }

  private isLatest(gen: number, latest: number): boolean {
    return this.alive && gen === latest;
  }

  private onQuery(raw: string): void {
    const q = raw.trim();
    const gen = ++this.searchGen;
    if (q.length === 0) {
      this.results = { kind: "empty" };
    } else if (q.length === 1) {
      this.results = { kind: "short", q };
    } else {
      // Results already on screen stay until the new ones replace them.
      const hits = this.results.kind === "done" || this.results.kind === "searching" ? this.results.hits : [];
      this.results = { kind: "searching", hits };
      api.search(q).then(
        (found) => {
          if (!this.isLatest(gen, this.searchGen)) return;
          this.results = { kind: "done", q, hits: found };
          this.renderResults();
        },
        (err) => {
          if (!this.isLatest(gen, this.searchGen)) return;
          this.results = { kind: "failed", message: errorText(err) };
          this.renderResults();
        },
      );
    }
    this.renderResults();
  }

  private renderResults(): void {
    if (!this.alive) return;
    const r = this.results;
    let status: string | null = null;
    let hits: Hit[] = [];
    switch (r.kind) {
      case "empty":
        break;
      case "short":
        status = `too short: ${r.q}`;
        break;
      case "searching":
        status = "searching…";
        hits = r.hits;
        break;
      case "done":
        status = `${r.hits.length} results for ${r.q}`;
        hits = r.hits;
        break;
      case "failed":
        status = `search failed: ${r.message}`;
        break;
    }
    const kids: Child[] = [];
    if (status !== null) kids.push(h("p", {}, status));
    if (hits.length > 0) kids.push(h("ul", {}, ...hits.map((hit) => this.hitRow(hit))));
    this.resultsEl.replaceChildren(...content(kids));
  }

  private hitRow(hit: Hit): HTMLElement {
    const prefix = hit.id === this.selectedId ? "> " : "";
    return h("li", { testid: "hit", onClick: () => this.selectHit(hit.id) }, h("button", {}, `${prefix}${hit.name}`));
  }

  private selectHit(id: number): void {
    this.selectedId = id;
    this.renderResults();
    this.loadItem(id);
  }

  private loadItem(id: number): void {
    const gen = ++this.itemGen;
    this.item = { kind: "loading", id };
    this.renderItem();
    api.fetchItem(id).then(
      (found) => {
        if (!this.isLatest(gen, this.itemGen)) return;
        this.item = found === null ? { kind: "missing", id } : { kind: "found", item: found };
        this.renderItem();
      },
      (err) => {
        if (!this.isLatest(gen, this.itemGen)) return;
        this.item = { kind: "failed", id, message: errorText(err) };
        this.renderItem();
      },
    );
  }

  private renderItem(): void {
    if (!this.alive) return;
    const v = this.item;
    let kids: Child[] = [];
    switch (v.kind) {
      case "none":
        kids = ["pick a result"];
        break;
      case "loading":
        kids = ["loading…"];
        break;
      case "found":
        kids = [h("h3", {}, v.item.name), h("p", {}, v.item.blurb)];
        break;
      case "missing":
        kids = [`item ${v.id} not found`];
        break;
      case "failed":
        kids = [
          h("p", {}, `failed: ${v.message}`),
          h("button", { testid: "retry-item", onClick: () => this.loadItem(v.id) }, "retry"),
        ];
        break;
    }
    this.itemEl.replaceChildren(...content(kids));
  }
}
