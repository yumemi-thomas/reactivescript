// The original package's types (@solid-primitives/pagination, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { MaybeAccessor } from "@solid-primitives/utils";
import { Accessor, Setter } from "solid-js";
import { JSX } from "@solidjs/web";
/**
 * createSegment - create a reactive segment out of an array of items
 * @param {MaybeAccessor<any[]>} items - array of items
 * @param {MaybeAccessor<number>} limit - limit of items per segment
 * @param {Accessor<number>} page - segment number starting with 1
 *
 * ```ts
 * const [limit, setLimit] = createSignal(10);
 * const [paginationProps, page, setPage] = createPagination(() => ({
 *   pages: Math.ceil(items().length / limit())
 * }));
 * const segment = createSegment(items, limit, page);
 * ```
 */
export declare const createSegment: <T>(items: MaybeAccessor<T[]>, limit: MaybeAccessor<number>, page: Accessor<number>) => Accessor<T[]>;
export type PaginationOptions = {
  /** the overall number of pages */
  pages: number;
  /** the highest number of pages to show at the same time */
  maxPages?: number;
  /** start with another page than `1` */
  initialPage?: number;
  /** number of pages a large jump, if it should exist, should skip */
  jumpPages?: number;
  /** show an element for the previous page */
  showPrev?: boolean | ((page: number, pages: number) => boolean);
  /** show an element for the next page */
  showNext?: boolean | ((page: number, pages: number) => boolean);
  /** content for the previous page element, e.g. an SVG icon, default is "<" */
  prevContent?: JSX.Element;
  /** content for the next page element, e.g. an SVG icon, default is ">" */
  nextContent?: JSX.Element;
  /** accessible name for the previous page element, default is "Previous page" */
  prevAriaLabel?: string;
  /** accessible name for the next page element, default is "Next page" */
  nextAriaLabel?: string;
  /** show an element for the first page */
  showFirst?: boolean | ((page: number, pages: number) => boolean);
  /** show an element for the last page */
  showLast?: boolean | ((page: number, pages: number) => boolean);
  /** content for the first page element, e.g. an SVG icon, default is "|<" */
  firstContent?: JSX.Element;
  /** content for the last page element, e.g. an SVG icon, default is ">|" */
  lastContent?: JSX.Element;
  /** accessible name for the first page element, default is "First page" */
  firstAriaLabel?: string;
  /** accessible name for the last page element, default is "Last page" */
  lastAriaLabel?: string;
  /** always show first and last page, with an adjacent ellipsis if there is a gap */
  showEllipsis?: boolean | ((page: number, pages: number) => boolean);
  /** content for the ellipsis element, e.g. an SVG icon or a text */
  ellipsisContent?: () => JSX.Element;
};
export type PaginationProps = {
  "aria-current"?: "page";
  "aria-label"?: string;
  disabled?: boolean;
  /** hides ellipsis from screen readers to be accessible */
  inert?: boolean;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  onKeyUp?: JSX.EventHandlerUnion<HTMLButtonElement, KeyboardEvent>;
  children: JSX.Element;
  /** page number this refers to, not enumerable, allows to use props.page to get the page number */
  readonly page?: number;
}[];
export declare const PAGINATION_DEFAULTS: {
  readonly pages: 1;
  readonly maxPages: 10;
  readonly showDisabled: true;
  readonly showFirst: true;
  readonly showPrev: true;
  readonly showNext: true;
  readonly showLast: true;
  readonly firstContent: "|<";
  readonly prevContent: "<";
  readonly nextContent: ">";
  readonly lastContent: ">|";
  readonly firstAriaLabel: "First page";
  readonly prevAriaLabel: "Previous page";
  readonly nextAriaLabel: "Next page";
  readonly lastAriaLabel: "Last page";
  readonly ellipsisContent: "...";
};
/**
 * Creates a reactive pagination to fill your layout with.
 * @param options Options to configure the pagination. Can be a reactive signal. See {@link PaginationOptions}
 * @returns A tuple of props, page and setPage. Props is an array of props to spread on each button. (See {@link PaginationProps}) Page is the current page number. setPage is a function to set the page number.
 * ```ts
 * [props: Accessor<PaginationProps>, page: Accessor<number>, setPage: Setter<number>]
 * ```
 * @example
 * ```tsx
 * const [paginationProps, page, setPage] = createPagination({ pages: 100 });
 *
 * createEffect(
 *   () => page(),
 *   page => console.log(page),
 * );
 *
 * <nav class="pagination">
 *   <For each={paginationProps()}>{props => <button {...props} />}</For>
 * </nav>
 * ```
 */
export declare const createPagination: (options?: MaybeAccessor<PaginationOptions>) => [props: Accessor<PaginationProps>, page: Accessor<number>, setPage: Setter<number>];
/** A single page's async fetch, gated independently of every other page. */
export type InfiniteScrollPage<T> = {
  /** the fetched items for this page — read inside `<Loading>`/`<Errored>` to gate a subtree on it */
  content: Accessor<T[]>;
  /** true while this page's fetch is in flight */
  fetching: Accessor<boolean>;
  /** the error from this page's last failed fetch, or undefined */
  error: Accessor<unknown>;
  /** re-runs this page's fetcher, clearing its error */
  retry: () => void;
};
/**
 * Provides an easy way to implement infinite scrolling. Each page is its own
 * independent async unit — render it with `<Loading>`/`<Errored>` for
 * idiomatic suspense/retry, or read `fetching`/`error` directly for a
 * boundary-free UI.
 *
 * ```tsx
 * const [pages, loader, { end }] = createInfiniteScroll(fetcher);
 *
 * <For each={pages()}>
 *   {page => (
 *     <Errored fallback={err => <button onClick={page.retry}>Retry: {String(err())}</button>}>
 *       <Loading fallback={<Skeleton />}>
 *         <For each={page.content()}>{item => <Row item={item} />}</For>
 *       </Loading>
 *     </Errored>
 *   )}
 * </For>
 * <Show when={!end()}><div ref={loader} /></Show>
 * ```
 * @param fetcher `(page: number) => Promise<T[]>`
 * @param options.initialPageCount how many pages to request up front, fetched the same way further pages are — defaults to 0 on the server (opt in for SSR content/SEO) and 1 in the browser
 * @return `pages()` is an accessor for the `{ content, fetching, error, retry }` bundle of every page requested so far, in order — feed directly to `<For>`
 * @return `loader` is a ref function to attach to the sentinel element that triggers loading more
 * @method `pageCount` is an accessor for the number of pages requested
 * @method `setPageCount` allows manually growing or jumping the requested page count
 * @method `end` is true once a page fetch returns zero items
 * @method `reset` disposes every page and starts over from the first page
 */
export declare function createInfiniteScroll<T>(fetcher: (page: number) => Promise<T[]>, options?: {
  initialPageCount?: number;
}): [pages: Accessor<InfiniteScrollPage<T>[]>, loader: (el: Element) => void, options: {
  pageCount: Accessor<number>;
  setPageCount: Setter<number>;
  end: Accessor<boolean>;
  reset: () => void;
}];
