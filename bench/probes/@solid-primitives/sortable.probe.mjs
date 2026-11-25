export const probes = { createSorted: { args: () => { const list = [3, 1, 2]; return [() => list, undefined, { dirty: true }]; } } };
