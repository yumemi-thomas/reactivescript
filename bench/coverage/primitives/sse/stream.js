// The library fails with the browser's Event where the stream closes, which is no Error: this module gives it one (the
// library's own row said `fails(Error)` until rx-verify ran it, 2026-11-24).
import { createSSE, makeSSE } from "@solid-primitives/sse";
export const createStream = url => {
  const source = (at, options) => makeSSE(at, { ...options, onError: event => options.onError(Object.assign(new Error("the stream failed"), { target: event.target })) });
  const { data, close, reconnect } = createSSE(url, { source });
  return { data, close, reconnect };
};
