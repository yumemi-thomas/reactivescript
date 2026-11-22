import type { Accessor, JSX } from "solid-js";
export declare function CounterProvider(props: { initial: number; children?: JSX.Element }): JSX.Element;
export declare function useCounter(): [Accessor<number>, () => void];
