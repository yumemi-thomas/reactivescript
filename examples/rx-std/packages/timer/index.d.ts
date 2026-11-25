// The original package's types (@solid-primitives/timer, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { Accessor, SignalOptions } from "solid-js";
/** A delay in milliseconds, or an {@link Accessor} of one, `false` to disable the timer. */
export type TimeoutSource = number | Accessor<number | false>;
/**
 * Create a timer ({@link setTimeout} or {@link setInterval}) and return a function to clear it.
 * Does not integrate with the reactive lifecycle — the caller is responsible for cleanup.
 *
 * @param fn Function to be called every {@link delay}.
 * @param delay Number representing the time between executions of {@link fn} in ms.
 * @param timer The timer to create: {@link setTimeout} or {@link setInterval}.
 * @returns Function to clear the timer.
 */
export declare const makeTimer: (fn: VoidFunction, delay: number, timer: typeof setTimeout | typeof setInterval) => VoidFunction;
/**
 * Create a timer ({@link setTimeout} or {@link setInterval})
 * with an optionally reactive delay.
 * If it changes, the elapsed fraction of the previous delay
 * will be counted as elapsed for the first new delay as well.
 *
 * @param fn Function to be called every {@link delay}.
 * @param delay Number or {@link Accessor} containing a number representing
 * the time between executions of {@link fn} in ms, or false to disable the timer.
 * @param timer The timer to create: {@link setTimeout} or {@link setInterval}.
 */
export declare const createTimer: (fn: VoidFunction, delay: TimeoutSource, timer: typeof setTimeout | typeof setInterval) => void;
/**
 * Like an interval from {@link createTimer}
 * except the timeout only updates between executions.
 *
 * @param handler Function to be called every {@link timeout}
 * @param timeout Number or Function returning a number representing the time
 * between executions of {@link handler} in ms, or false to disable looping.
 */
export declare const createTimeoutLoop: (handler: VoidFunction, timeout: TimeoutSource) => void;
/**
 * Polls a function periodically. Returns an {@link Accessor} containing the latest polled value.
 *
 * @param fn Function to be executed immediately, then every {@link timeout}.
 * @param timeout Number or {@link Accessor} containing a number representing
 * the time between executions of {@link fn} in ms, or false to disable polling.
 * @param value Initial value passed to {@link fn}. Defaults to undefined.
 * @param options Signal options for createSignal.
 * @returns An {@link Accessor} containing the latest polled value.
 * @example
 * const date = createPolled(() => new Date(), 1000);
 * date() // T: Date
 * // with reactive delay
 * const [delay, setDelay] = createSignal(1000);
 * createPolled(() => new Date(), delay);
 */
export declare function createPolled<T extends P, P = T>(fn: (prev: P | Exclude<undefined, P>) => T, timeout: TimeoutSource, value?: undefined, options?: SignalOptions<T>): Accessor<T>;
/** {@link createPolled} overload with an explicit initial `value` of a distinct type `I`. */
export declare function createPolled<T extends P, I = T, P = T>(fn: (prev: P | I) => T, timeout: TimeoutSource, value: I, options?: SignalOptions<T>): Accessor<T>;
/**
 * Creates a counter which increments periodically.
 *
 * @param timeout Number or {@link Accessor} containing a number representing
 * the time between increments in ms, or false to disable the counter.
 * @returns An {@link Accessor} containing the current count.
 */
export declare const createIntervalCounter: (timeout: TimeoutSource, options?: SignalOptions<number>) => Accessor<number>;
