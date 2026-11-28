export const probes = { createWSState: { args: () => [Object.assign(new EventTarget(), { readyState: 0, close() {} })] } };
