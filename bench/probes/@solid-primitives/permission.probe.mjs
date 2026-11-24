globalThis.navigator.permissions ??= { query: async () => Object.assign(new EventTarget(), { state: "granted" }) };
export const probes = { createPermission: { args: () => ["geolocation"] } };
