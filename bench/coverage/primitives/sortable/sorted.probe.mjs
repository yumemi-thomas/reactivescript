// What rx-verify calls sortedBy with (09 MO-8v: a word read from the code is run against what the reading claims).
export const probes = { sortedBy: { args: () => [() => [3, 1, 2], (a, b) => a - b] } };
