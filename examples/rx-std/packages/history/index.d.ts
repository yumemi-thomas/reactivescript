// The original package's types (@solid-primitives/history, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { Many } from "@solid-primitives/utils";
import { Accessor } from "solid-js";
/**
 * Configuration object for {@link createUndoHistory}.
 */
export type UndoHistoryOptions = {
  /**
   * The maximum number of undo steps to keep in memory.
   * @default 100
   */
  limit?: number;
};
/**
 * Return type of {@link createUndoHistory}.
 */
export type UndoHistoryReturn = {
  /**
   * @returns `true` if an undo step is available, `false` otherwise.
   *
   * @see {@link UndoHistoryReturn.undo}
   */
  canUndo: Accessor<boolean>;
  /**
   * @returns `true` if an redo step is available, `false` otherwise.
   *
   * @see {@link UndoHistoryReturn.redo}
   */
  canRedo: Accessor<boolean>;
  /**
   * Undo the last step. Does nothing if {@link UndoHistoryReturn.canUndo} is `false`.
   *
   * It calls the callback returned from the {@link createUndoHistory} source.
   */
  undo: VoidFunction;
  /**
   * Redo the last step. Does nothing if {@link UndoHistoryReturn.canRedo} is `false`.
   *
   * It calls the callback returned from the {@link createUndoHistory} source.
   */
  redo: VoidFunction;
};
/**
 * Creates an undo history from a reactive source for going back and forth between state snapshots.
 *
 * @param source A function or an array thereof that tracks the state to be restored, and returns a callback to restore it.
 * @param options Configuration object. See {@link UndoHistoryOptions}.
 * @returns An object for interacting with the undo history. See {@link UndoHistoryReturn}.
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/history#createUndoHistory
 *
 * @example
 * ```ts
 * const [count, setCount] = createSignal(0);
 *
 * const history = createUndoHistory(() => {
 *   // track the changes to the state (and clone if you need to)
 *   const v = count();
 *   // return a callback to set the state back to the tracked value
 *   return () => setCount(v);
 * });
 *
 * // undo the last change
 * history.undo();
 *
 * // redo the last change
 * history.redo();
 * ```
 */
export declare function createUndoHistory(source: Many<Accessor<VoidFunction | false | undefined | null | void>>, options?: UndoHistoryOptions): UndoHistoryReturn;
