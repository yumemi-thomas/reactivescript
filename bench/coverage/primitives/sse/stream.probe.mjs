// an EventSource that answers one message, or closes
let down = false;
globalThis.EventSource = class extends EventTarget {
  readyState = 0;
  constructor() { super(); setTimeout(() => { this.readyState = down ? 2 : 1; this.dispatchEvent(down ? new Event("error") : Object.assign(new Event("message"), { data: "hello" })); }, 5); }
  close() {}
};
export const probes = { createStream: { args: () => [() => "/events"], fail: () => { down = true; return [() => "/events"]; } } };
