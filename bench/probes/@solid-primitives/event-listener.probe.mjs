// What rx-verify calls these with (09 MO-8v: a word read from the code is run against what the reading claims).
let last;
export const probes = { makeEventListener: { args: () => [(last = new EventTarget()), "ping", () => {}], act: () => last.dispatchEvent(new Event("ping")) } };
