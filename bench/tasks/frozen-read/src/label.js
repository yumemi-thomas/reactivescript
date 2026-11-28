// Two small primitives, as a design system ships them: a label that follows what it is given (an accessor), and a
// stamp made once from a value.
import { createMemo } from "solid-js";
export const createLabel = text => createMemo(() => `[${text()}]`);
export const createStamp = text => { const made = `#${text}`; return () => made; };
