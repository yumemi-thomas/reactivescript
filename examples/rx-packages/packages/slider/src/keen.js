// KeenSlider, as it is.
import KeenSlider from "keen-slider";
const opts = (el, options) => ({ selector: el.childNodes, ...options });
/** A slider in `el`; answers what is asked of it and what ends it. */
export function mount(el, options, plugins, changed) {
  const s = new KeenSlider(el, opts(el, options), plugins); el.classList.add("keen-slider");
  s.on("slideChanged", () => changed(s.track.details.rel));
  const count = () => s.track.details?.slides?.length ?? 0;
  return { next: () => s.next(), prev: () => s.prev(), go: (i, ms = 250) => s.moveToIdx(i, false, { duration: ms }), update: (o) => s.update(opts(el, o)), count, at: () => s.track.details?.rel ?? 0, destroy: () => s.destroy(), slides: () => s.slides };
}
export const watchSlides = (el, f) => { const o = new MutationObserver(f); o.observe(el, { childList: true }); return () => o.disconnect(); };
export const mark = (s, i, name) => s.slides().forEach((e, j) => e.classList.toggle(name, i === j));
export const indexIn = (s, target) => s.slides().findIndex((e) => e.contains(target));
