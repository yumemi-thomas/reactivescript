/** A request to open the help page with a query and one hit selected. */
export interface HelpRequest {
  /** The query the help page opens with; its search runs as if the user had typed it. */
  query: string;
  /** The hit to select and show. */
  hitId: number;
}

/** A mounted page. Leaving the page calls `destroy`; its pending answers are then ignored. */
export interface PageHandle {
  destroy(): void;
}

/** What the pages may ask of the app around them. */
export interface Shell {
  /** Sets the open-issue count shown on the issues tab. */
  setCount(count: number): void;
  /** Moves the open-issue count by `delta`, as an optimistic close does. */
  adjustCount(delta: number): void;
  /** Opens the help page with a request. */
  openHelp(request: HelpRequest): void;
}
