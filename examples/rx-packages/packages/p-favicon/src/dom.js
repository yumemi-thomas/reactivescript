export { makeFavicon } from "@solid-primitives/favicon";
import { isServer } from "@solidjs/web";
export const resolve = (h) => { try { return isServer ? h : new URL(h, document.baseURI).href; } catch { return h; } };
