import { createTrigger } from "@solid-primitives/trigger";
export const createVersion = () => { const [track, dirty] = createTrigger(); let n = 0; return [() => { track(); return n; }, () => { n++; dirty(); }]; };
