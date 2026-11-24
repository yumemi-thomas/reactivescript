// happy-dom has no media devices: one that answers once
globalThis.navigator.mediaDevices ??= Object.assign(new EventTarget(), { enumerateDevices: async () => [{ deviceId: "a" }] });
export const probes = { createDevices: { args: () => [] } };
