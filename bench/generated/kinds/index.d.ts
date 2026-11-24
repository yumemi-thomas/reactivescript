import type { Accessor, Component, Context } from "solid-js";
import type { JSX } from "@solidjs/web";
export declare function plain(v: any): any;
export declare function proven(v: number): string;
export declare function load(id: number): Promise<string>;
export declare function rejecting(id: number): Promise<string>;
export declare class NotFound extends Error { constructor(m?: string); }
export declare class Cart { items: number[]; add(n: number): void; }
export declare const limit: number;
export declare const client: { reset(): void; k(n: number): number; load(id: number): Promise<string> };
export declare const double: (v: number) => number;
export declare enum Side { Left, Right }
export interface Merged { a: number }
export declare const Merged: (v: any) => Merged;
export interface OnlyType { a: number }
export declare function sortInPlace(list: number[]): void;
export declare function later(run: () => void): void;
export declare function each(list: number[], by: (a: number, b: number) => number): number[];
export declare function on(name: string, run: (v: any) => void): () => void;
export declare function makes(v?: any): { total: number; go: (n: number) => void };
export declare function makesFn(v?: any): (n: number) => number;
export declare function makesRef(v?: any): Accessor<number>;
export declare function makesPair(v?: any): [Accessor<number>, (n: number) => void];
export declare const Ctx: Context<{ n: number }>;
export declare function useCtx(): { n: number };
export declare function Provider(props: { children: JSX.Element }): JSX.Element;
export declare function Card(props: { title: string; onClose?: () => void; children?: JSX.Element }): JSX.Element;
export declare const Dialog: { Root: Component<{ children?: JSX.Element }>; Title: Component<{ text: string }> };
export declare const toast: { (m: string): number; success: (m: string) => number; k: (v: any) => any };
export declare function mapped(x: { [K in "a" | "b"]: number }): number;
declare function fallback(v: any): any;
export default fallback;
