import { createContext, createSignal, onCleanup, useContext } from "solid-js";
let kept = 0;
export function plain(v) { kept++; globalThis.document?.title; return v; }
export function proven(v) { return String(v); }
export function load(id) { return globalThis.fetch("/" + id).then(r => r.text()); }
export class NotFound extends Error {}
export async function rejecting(id) { if (id < 0) throw new NotFound("none"); return "a"; }
export class Cart { items = []; add(n) { this.items.push(n); } }
export const limit = 3;
export const client = { reset() { kept = 0; }, k(n) { return n; }, load };
export const double = v => v * 2;
export var Side; (function (S) { S[S.Left = 0] = "Left"; S[S.Right = 1] = "Right"; })(Side || (Side = {}));
export const Merged = v => ({ a: v });
export function sortInPlace(list) { list.sort(); }
export function later(run) { setTimeout(run, 1); }
export function each(list, by) { return [...list].sort(by); }
export function on(name, run) { globalThis.addEventListener(name, run); return () => globalThis.removeEventListener(name, run); }
export function makes(v) { const [n, set] = createSignal(v); onCleanup(() => set(0)); return { get total() { return n(); }, go: x => { set(x); } }; }
export function makesFn(v) { const [n] = createSignal(v); onCleanup(() => {}); return x => x + n(); }
export function makesRef(v) { const [n] = createSignal(v); onCleanup(() => {}); return n; }
export function makesPair(v) { const [n, set] = createSignal(v); onCleanup(() => {}); return [n, x => { set(x); }]; }
export const Ctx = createContext();
export function useCtx() { return useContext(Ctx); }
export function Provider(props) { return Ctx({ value: { n: 1 }, get children() { return props.children; } }); }
export function Card(props) { return props.title; }
export const Dialog = { Root: p => p.children, Title: p => p.text };
export const toast = Object.assign(m => ++kept, { success: m => ++kept, k: v => v });
export function mapped(x) { return x.a; }
export default function fallback(v) { return v; }
