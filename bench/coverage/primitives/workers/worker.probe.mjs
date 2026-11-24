globalThis.Worker ??= class extends EventTarget { postMessage() {} terminate() {} };
URL.createObjectURL ??= () => "blob:x";
export const probes = { createSquarer: { args: () => [] } };
