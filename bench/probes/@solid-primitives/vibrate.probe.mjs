globalThis.navigator.vibrate ??= () => true;
export const probes = { createVibrate: { args: () => [() => [10]] } };
