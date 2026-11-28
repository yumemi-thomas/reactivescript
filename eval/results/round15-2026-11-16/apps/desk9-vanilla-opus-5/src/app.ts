import type { Hit, Issue } from "./api.js";
import { Field } from "./dom.js";

export type PageName = "issues" | "help" | "settings";

export interface Page {
  el: HTMLElement;
  /** Re-render after shared state changed. */
  refresh(): void;
  /** The page left the screen: ignore anything that arrives later. */
  dispose(): void;
}

export interface HelpInit {
  query: string;
  hits: Hit[];
  selectedId: number;
}

/** What the client believes about an issue beyond what it last read: in-flight and confirmed changes. */
export class IssueOverlay {
  assignee = new Field<string | null>();
  title = new Field<string>();
  closed = new Field<boolean>();
}

export interface AppContext {
  overlay(id: number): IssueOverlay;
  /** Shared issue state changed: update the count and the open page. */
  changed(): void;
  /** The issues page loaded the open issues (its latest request). */
  setOpenIssues(items: Issue[], seq: number): void;
  openPage(name: PageName, init?: HelpInit): void;
}
