// solid-use's utilities that are a module's default export, by name — a `.d.rx` declares named exports, so an `.rx`
// program imports them from here — and the one call the app cannot write in `.rx`: `useServerValue` is given a function
// that is not pure on purpose (the server runs it, the browser takes the server's answer).
import useServerValue from "solid-use/server-value";
export { default as useOnlineStatus } from "solid-use/online-status";
export { default as usePageVisibility } from "solid-use/page-visibility";
export const useTicket = () => useServerValue(() => Math.random().toString(36).slice(2, 8));
