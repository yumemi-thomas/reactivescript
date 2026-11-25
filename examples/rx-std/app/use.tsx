// The packages from TypeScript: types are the original's (index.d.ts) for the facades, the printed ones for `core`.
import { createMediaQuery } from "@rx-primitives/media";
import { createSorted } from "@rx-primitives/sortable";
import * as core from "@rx-primitives/sortable/core";
const wide: () => boolean = createMediaQuery("(min-width: 1px)");
const names: () => string[] = createSorted(() => ["b", "a"]);
const weaker: () => any[] = core.createSorted(() => ["b", "a"], () => (a, b) => 0);
export { wide, names, weaker };
