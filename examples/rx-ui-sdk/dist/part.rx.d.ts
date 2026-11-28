import { Instance, Named, User, Part } from "./bridge.js";
export declare function usePart(it: Instance, slot: string, named: Named, user: User, options: object): {
    part: Part;
    attrs: import("./bridge.js").Attrs;
    now: any;
    tick: number;
};
