import { createMarker, makeSearchRegex } from "@solid-primitives/marker";
export const createHighlighter = () => { const mark = createMarker(match => `[${match()}]`); return { parts: (text, query) => mark(text, makeSearchRegex(query)) }; };
