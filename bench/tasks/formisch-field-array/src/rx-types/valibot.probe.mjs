// What rx-verify calls these with (09 MO-8v: a word read from the code is run against what the reading claims).
import * as v from "valibot";
export const probes = { object: { args: () => [{ name: v.string() }] }, array: { args: () => [v.string()] }, pipe: { args: () => [v.string(), v.minLength(1)] }, minLength: { args: () => [3] } };
