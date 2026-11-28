// The one call the app cannot write in `.rx`: `useServerValue` is given a function that is not pure on purpose (the
// server runs it, the browser takes the server's answer). The utilities that are a module's default export are
// imported by the `.rx` program itself (`import { default as useOnlineStatus }`, 09 MO-8u): this module named them
// until 2026-11-25.
import useServerValue from "solid-use/server-value";
export const useTicket = () => useServerValue(() => Math.random().toString(36).slice(2, 8));
