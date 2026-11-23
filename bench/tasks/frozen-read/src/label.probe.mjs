// What rx-verify calls these with (09 MO-8v: a word read from the code is run against what the reading claims).
export const probes = { createLabel: { args: () => [() => "a"] }, createStamp: { args: () => ["a"] } };
