// What rx-verify calls these with (09 MO-8v: a word read from the code is run against what the reading claims).
export const probes = { moveItem: { args: () => [[1, 2, 3], 0, 2] }, sortBy: { args: () => [[{ n: "b" }, { n: "a" }], "n"] }, later: { args: () => [() => {}] } };
