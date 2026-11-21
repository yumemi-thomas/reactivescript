import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { button, div, errorMessage, field, h2, li, p, ul } from "./dom.js";

export interface HelpStart {
  query: string;
  hitId: number;
}

/** The help page. Leaving it discards it; answers that arrive afterwards are ignored. */
export function mountHelp(host: HTMLElement, start: HelpStart | null): () => void {
  const page = new HelpPage(host);
  page.start(start);
  return () => page.dispose();
}

type ItemState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; item: Item }
  | { kind: "missing"; id: number }
  | { kind: "error"; id: number; message: string };

class HelpPage {
  private readonly host: HTMLElement;
  private readonly queryInput: HTMLInputElement;
  private readonly resultsEl: HTMLDivElement;
  private readonly itemEl: HTMLDivElement;

  private alive = true;
  private searchSeq = 0;
  private itemSeq = 0;
  private hits: Hit[] = [];
  private status = "";
  private selectedId: number | null = null;
  private item: ItemState = { kind: "idle" };

  constructor(host: HTMLElement) {
    this.host = host;
    this.queryInput = field("query", "", (value) => this.onQuery(value), { "aria-label": "Search help" });
    this.resultsEl = div({ test: "results" });
    this.itemEl = div({ test: "item" });
  }

  start(start: HelpStart | null): void {
    this.host.replaceChildren(div({ test: "help-page" }, [this.queryInput, this.resultsEl, this.itemEl]));
    this.renderResults();
    this.renderItem();
    if (start !== null) {
      this.queryInput.value = start.query;
      this.selectHit(start.hitId);
      this.onQuery(start.query);
    }
  }

  dispose(): void {
    this.alive = false;
  }

  private onQuery(q: string): void {
    const seq = ++this.searchSeq;
    if (q.length === 0) {
      this.hits = [];
      this.status = "";
      this.renderResults();
      return;
    }
    if (q.length < 2) {
      this.hits = [];
      this.status = `too short: ${q}`;
      this.renderResults();
      return;
    }
    // results already on screen stay until the new ones replace them
    this.status = "searching…";
    this.renderResults();
    search(q).then(
      (hits) => {
        if (!this.alive || seq !== this.searchSeq) return;
        this.hits = hits;
        this.status = `${hits.length} results for ${q}`;
        this.renderResults();
      },
      (e: unknown) => {
        if (!this.alive || seq !== this.searchSeq) return;
        this.hits = [];
        this.status = `search failed: ${errorMessage(e)}`;
        this.renderResults();
      },
    );
  }

  private selectHit(id: number): void {
    this.selectedId = id;
    this.renderResults();
    this.loadItem(id);
  }

  private loadItem(id: number): void {
    const seq = ++this.itemSeq;
    this.item = { kind: "loading" };
    this.renderItem();
    fetchItem(id).then(
      (item) => {
        if (!this.alive || seq !== this.itemSeq) return;
        this.item = item === null ? { kind: "missing", id } : { kind: "ok", item };
        this.renderItem();
      },
      (e: unknown) => {
        if (!this.alive || seq !== this.itemSeq) return;
        this.item = { kind: "error", id, message: errorMessage(e) };
        this.renderItem();
      },
    );
  }

  private retryItem(): void {
    const s = this.item;
    if (s.kind === "error") this.loadItem(s.id);
  }

  private renderResults(): void {
    if (!this.alive) return;
    const selected = this.selectedId;
    this.resultsEl.replaceChildren(
      p({ text: this.status }),
      ul(
        {},
        this.hits.map((hit) =>
          li({ onClick: () => this.selectHit(hit.id) }, [
            button(selected === hit.id ? `> ${hit.name}` : hit.name, () => undefined, { test: "hit" }),
          ]),
        ),
      ),
    );
  }

  private renderItem(): void {
    if (!this.alive) return;
    const s = this.item;
    if (s.kind === "idle") {
      this.itemEl.replaceChildren(p({ text: "pick a result" }));
      return;
    }
    if (s.kind === "loading") {
      this.itemEl.replaceChildren(p({ text: "loading…" }));
      return;
    }
    if (s.kind === "ok") {
      this.itemEl.replaceChildren(h2({ text: s.item.name }), p({ text: s.item.blurb }));
      return;
    }
    if (s.kind === "missing") {
      this.itemEl.replaceChildren(p({ text: `item ${s.id} not found` }));
      return;
    }
    this.itemEl.replaceChildren(
      p({ text: `failed: ${s.message}` }),
      button("retry", () => this.retryItem(), { test: "retry-item" }),
    );
  }
}
