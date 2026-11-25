export const make = () => { const o = { big: new Array(1000).fill(0) }; (globalThis.refs ??= []).push(new WeakRef(o)); return o; };
