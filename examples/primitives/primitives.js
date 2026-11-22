// @solid-primitives (Solid 2.0 releases), re-exported for the app.
// makePersisted wraps a Solid signal; an .rx program has none to pass, so the signal is made here (09 MO-10c): the app
// is handed the reader and the setter the library gives back
import { createSignal } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
export const persisted = (init, options) => { const [get, set] = makePersisted(createSignal(init), options); return [get, set]; };
export { createMediaQuery } from "@solid-primitives/media";
export { createWindowSize } from "@solid-primitives/resize-observer";
export { createActiveElement } from "@solid-primitives/active-element";
export { createIntervalCounter } from "@solid-primitives/timer";
export { createPagination } from "@solid-primitives/pagination";
export { debounce } from "@solid-primitives/scheduled";
export { WindowEventListener } from "@solid-primitives/event-listener";
export { Key } from "@solid-primitives/keyed";
export { createMousePosition } from "@solid-primitives/mouse";
