// What the browser shows now. No declaration: nothing proves a read of the browser `pure`, so the importer says it
// (R-io-4: it writes nothing, and may be asked again), `import pure { first, matches } from "@reactivescript/std/now"`,
// and gives it to `first`. (`await` of a `client` read (SV-7b) would carry `fails(Error)`, which no row can take away.)
import { sharedConfig } from "solid-js";
import { isServer } from "@solidjs/web";
/** What `read` answers; `otherwise` on the server and while the page hydrates, so that both sides make one page. */
export const first = (read, otherwise) => (isServer || sharedConfig.hydrating ? otherwise : read());
/** Undefined where the browser cannot say. */
export const matches = query => window.matchMedia?.(query).matches;
export const isVisible = () => document.visibilityState === "visible";
export const windowSize = () => ({ width: window.innerWidth, height: window.innerHeight });
export const boxOf = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
