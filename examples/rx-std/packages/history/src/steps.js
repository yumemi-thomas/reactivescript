import { createMemo } from "solid-js";
/** The sources as one accessor: the functions that set each back, or nothing while none has any. */
export function entries(source) {
  const sources = (Array.isArray(source) ? source : [source]).map(s => createMemo(s));
  return () => { const entry = sources.map(s => s() || undefined); return entry.some(Boolean) ? entry : null; };
}
