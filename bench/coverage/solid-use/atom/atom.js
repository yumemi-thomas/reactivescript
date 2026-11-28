import atom from "solid-use/atom";
export const createAtom = init => { const a = atom(init); return [() => a(), v => { a(v); }]; };
