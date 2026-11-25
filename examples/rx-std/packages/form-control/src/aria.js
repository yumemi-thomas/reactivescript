import { createUniqueId } from "solid-js";
export const access = v => (typeof v === "function" ? v() : v);
export function idOf(props) { let own; return () => access(props.id) ?? (own ??= `form-control-${createUniqueId()}`); }
export const registers = set => id => { set(id); return () => { set(undefined); }; };
