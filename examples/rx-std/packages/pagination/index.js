import { createMemo, flush, getOwner, untrack } from "solid-js";
import { isServer } from "@solidjs/web";
import * as core from "@rx-primitives/pagination/core";
// rows made outside a view, each with a request and an owner of its own: not .rx's (REPORT.md)
export { createInfiniteScroll } from "@solid-primitives/pagination";

const accessor = v => (typeof v === "function" ? v : () => v);
export const PAGINATION_DEFAULTS = { pages: 1, maxPages: 10, showDisabled: true, showFirst: true, showPrev: true, showNext: true, showLast: true, firstContent: "|<", prevContent: "<", nextContent: ">", lastContent: ">|", firstAriaLabel: "First page", prevAriaLabel: "Previous page", nextAriaLabel: "Next page", lastAriaLabel: "Last page", ellipsisContent: "..." };
export { createSegment } from "@rx-primitives/pagination/core";

// the buttons' props: records with getters, hidden fields and event tuples, as the original hands them to a spread
const define = (fields, hidden) => Object.defineProperties({}, {
  ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "function" && !k.startsWith("on") ? { get: v, set() {}, enumerable: true } : { value: v, enumerable: true, writable: true }])),
  ...Object.fromEntries(Object.entries(hidden).map(([k, v]) => [k, typeof v === "function" ? { get: v, enumerable: false } : { value: v, enumerable: false }])),
});
export function createPagination(options) {
  const opts = createMemo(() => ({ ...PAGINATION_DEFAULTS, ...accessor(options)() }));
  const p = core.createPage(() => opts().pages, () => opts().maxPages, untrack(() => opts().initialPage) || 1);
  const { page, shown } = p;
  const setPage = v => { const n = typeof v === "function" ? v(untrack(page)) : v; const to = Math.max(1, Math.min(n, untrack(opts).pages)); p.set(n); return to; };
  const goPage = (n, ev) => {
    let parent = ev.currentTarget, current;
    while (parent instanceof HTMLElement && parent.childElementCount < 3) parent = parent.parentNode;
    setPage(n); flush();
    while (parent instanceof HTMLElement && !(current = parent.querySelector('[aria-current="page"]'))) parent = parent.parentNode;
    if (current instanceof HTMLElement) current.focus();
  };
  const onKeyUp = (n, ev) => ({ ArrowLeft: () => goPage(q => q - 1, ev), ArrowRight: () => goPage(q => q + 1, ev), Home: () => goPage(1, ev), End: () => goPage(opts().pages, ev), Space: () => goPage(n, ev), Return: () => goPage(n, ev) })[ev.key]?.();
  const events = (click, key) => (isServer ? {} : { onClick: click, onKeyUp: key });
  const number = n => define({ children: n.toString(), ...events([setPage, n], [onKeyUp, n]), "aria-current": () => (page() === n ? "page" : undefined) }, { page: n });
  const pages = createMemo(prev => Array.from({ length: opts().pages }, (_, i) => prev?.[i] || number(i + 1)));
  const jump = () => opts().jumpPages || Infinity;
  const first = define({ ...events([setPage, 1], [onKeyUp, 1]), disabled: () => page() <= 1, children: () => opts().firstContent, "aria-label": () => opts().firstAriaLabel }, { page: 1 });
  const back = define({ ...events(() => setPage(n => (n > 1 ? n - 1 : n)), ev => onKeyUp(page() - 1, ev)), disabled: () => page() <= 1, children: () => opts().prevContent, "aria-label": () => opts().prevAriaLabel }, { page: () => Math.max(1, page() - 1) });
  const next = define({ ...events(() => setPage(n => (n < opts().pages ? n + 1 : n)), ev => onKeyUp(page() - 1, ev)), disabled: () => page() >= opts().pages, children: () => opts().nextContent, "aria-label": () => opts().nextAriaLabel }, { page: () => Math.min(opts().pages, page() + 1) });
  const last = define({ ...events(() => setPage(opts().pages), ev => onKeyUp(opts().pages, ev)), disabled: () => page() >= opts().pages, children: () => opts().lastContent, "aria-label": () => opts().lastAriaLabel }, { page: () => opts().pages });
  const jumpBack = define({ ...events(() => setPage(Math.max(1, page() - jump())), ev => onKeyUp(page() - jump(), ev)), disabled: () => page() - jump() < 0, children: () => `-${opts().jumpPages}` }, { page: () => Math.max(1, page() - jump()) });
  const jumpForth = define({ ...events(() => setPage(Math.min(opts().pages, page() + jump())), ev => onKeyUp(Math.min(opts().pages, page() + jump()), ev)), disabled: () => page() + jump() > opts().pages, children: () => `+${opts().jumpPages}` }, { page: () => Math.min(opts().pages, page() + jump()) });
  const ellipsis = define({ inert: true, children: () => { const c = opts().ellipsisContent; return typeof c === "function" ? c() : PAGINATION_DEFAULTS.ellipsisContent; } }, {});
  const shows = key => createMemo(() => { const v = opts()[key]; return typeof v === "boolean" ? v : typeof v === "function" ? v(page(), opts().pages) : PAGINATION_DEFAULTS[key]; });
  const showFirst = shows("showFirst"), showPrev = shows("showPrev"), showNext = shows("showNext"), showLast = shows("showLast");
  const props = createMemo(() => {
    const o = opts(), { start, count } = shown(), list = pages();
    const dots = typeof o.showEllipsis === "function" ? o.showEllipsis(page(), list.length) : o.showEllipsis;
    const before = dots && start > 0, after = dots && start + count < list.length - 1, out = [];
    if (showFirst() && !dots) out.push(first);
    if (o.jumpPages) out.push(jumpBack);
    if (showPrev()) out.push(back);
    if (before) out.push(list[0], ellipsis);
    out.push(...list.slice(start + (before ? 2 : 0), start + count - (after ? 2 : 0)));
    if (after) out.push(ellipsis, list.at(-1));
    if (showNext()) out.push(next);
    if (o.jumpPages) out.push(jumpForth);
    if (showLast() && !dots) out.push(last);
    return out;
  });
  return [props, page, setPage];
}
