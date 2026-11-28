import { isServer } from "@solidjs/web";
import { onCleanup } from "solid-js";
import * as core from "@rx-primitives/timer/core";

export const makeTimer = (fn, delay, timer) => {
  if (isServer) return () => {};
  const id = timer(fn, delay);
  return () => clearInterval(id);
};
export const createTimer = (fn, delay, timer) => {
  if (typeof delay === "number") onCleanup(makeTimer(fn, delay, timer));
  else core.createTimer(fn, delay, timer);
};
export const createTimeoutLoop = (handler, timeout) => {
  if (typeof timeout === "number") onCleanup(makeTimer(handler, timeout, setInterval));
  else core.createTimeoutLoop(handler, timeout);
};
export { createPolled, createIntervalCounter } from "@rx-primitives/timer/core";
