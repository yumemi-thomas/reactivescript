export declare const frame: (f: () => void) => () => void;
export declare function bound(generation: number, done: (generation: number) => void): (ev?: any) => void;
