// The original package's types (@solid-primitives/keyboard, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { createSingletonRoot } from "@solid-primitives/rootless";
import { MaybeAccessor } from "@solid-primitives/utils";
import { Accessor } from "solid-js";
export type ModifierKey = "Alt" | "Control" | "Meta" | "Shift";
export type KbdKey = ModifierKey | (string & {});
/**
 * Provides a signal with the last keydown event.
 *
 * The signal is `null` initially, and is reset to that after a timeout.
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#useKeyDownEvent
 *
 * @returns
 * Returns a signal of the last keydown event
 * ```ts
 * Accessor<KeyboardEvent | null>
 * ```
 *
 * @example
 * ```ts
 * const event = useKeyDownEvent();
 *
 * createEffect(
 *   () => event(), // => KeyboardEvent | null
 *   e => {
 *     console.log(e);
 *     if (e) {
 *       console.log(e.key); // => "Q" | "ALT" | ...
 *       e.preventDefault();
 *     }
 *   },
 * );
 * ```
 */
export declare const useKeyDownEvent: ReturnType<typeof createSingletonRoot<Accessor<KeyboardEvent | null>>>;
/**
 * Provides a signal with the list of currently held keys, ordered from least recent to most recent.
 *
 * This is a [singleton root primitive](https://github.com/solidjs-community/solid-primitives/tree/main/packages/rootless#createSingletonRoot). *(signals and event-listeners are reused across dependents)*
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#useKeyDownList
 *
 * @returns
 * Returns a signal of a list of keys
 * ```ts
 * Accessor<string[]>
 * ```
 *
 * @example
 * ```ts
 * const keys = useKeyDownList();
 * createEffect(
 *   () => keys(), // => ["ALT", "CONTROL", "Q", "A"]
 *   keys => console.log(keys),
 * );
 * ```
 */
export declare const useKeyDownList: ReturnType<typeof createSingletonRoot<Accessor<string[]>>>;
/**
 * Provides a signal with the currently held single key. Pressing any other key at the same time will reset the signal to `null`.
 *
 * This is a [singleton root primitive](https://github.com/solidjs-community/solid-primitives/tree/main/packages/rootless#createSingletonRoot). *(signals and event-listeners are reused across dependents)*
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#useCurrentlyHeldKey
 *
 * @returns
 * ```ts
 * Accessor<string | null>
 * ```
 *
 * @example
 * ```ts
 * const key = useCurrentlyHeldKey();
 * createEffect(
 *   () => key(), // => "Q" | "ALT" | ... or null
 *   key => console.log(key),
 * );
 * ```
 */
export declare const useCurrentlyHeldKey: ReturnType<typeof createSingletonRoot<Accessor<string | null>>>;
/**
 * Provides a signal with a sequence of currently held keys, as they were pressed down and up.
 *
 * This is a [singleton root primitive](https://github.com/solidjs-community/solid-primitives/tree/main/packages/rootless#createSingletonRoot). *(signals and event-listeners are reused across dependents)*
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#useKeyDownSequence
 *
 * @returns
 * ```ts
 * Accessor<string[][]>
 * // [["CONTROL"], ["CONTROL", "Q"], ["CONTROL", "Q", "A"]]
 * ```
 *
 * @example
 * ```ts
 * const sequence = useKeyDownSequence();
 * createEffect(
 *   () => sequence(), // => string[][]
 *   sequence => console.log(sequence),
 * );
 * ```
 */
export declare const useKeyDownSequence: ReturnType<typeof createSingletonRoot<Accessor<string[][]>>>;
/**
 * Provides a `boolean` signal indicating if provided {@link key} is currently being held down.
 * Holding multiple keys at the same time will return `false` — holding only the specified one will return `true`.
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#createKeyHold
 *
 * @param key The key to check for.
 * @param options The options for the key hold.
 * - `preventDefault` — Controls if the keydown event should have its default action prevented. Enabled by default.
 * @returns
 * ```ts
 * Accessor<boolean>
 * ```
 *
 * @example
 * ```ts
 * const isHeld = createKeyHold("ALT");
 * createEffect(
 *   () => isHeld(), // => boolean
 *   held => console.log(held),
 * );
 * ```
 */
export declare function createKeyHold(key: KbdKey, options?: {
  preventDefault?: boolean;
}): Accessor<boolean>;
/**
 * Creates a keyboard shortcut observer. The provided {@link callback} will be called when the specified {@link keys} are pressed.
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/keyboard#createShortcut
 *
 * @param keys The sequence of keys to watch for.
 * @param callback The callback to call when the keys are pressed.
 * @param options The options for the shortcut.
 * - `preventDefault` — Controls if the keydown event should have its default action prevented. Enabled by default.
 * - `requireReset` — If `true`, the shortcut will only be triggered once until all of the keys stop being pressed. Disabled by default.
 * - `ignoreWithinInputs` — If `true`, the shortcut is ignored while focus is on an `input`, `textarea`, `select`,
 *   or `contenteditable` element, so typing isn't interrupted. Disabled by default — enable it for shortcuts
 *   made of plain, unmodified keys (e.g. a single letter); combos like `Control+S` are usually fine either way,
 *   since the modifier prevents a character from being typed.
 * - `anyOrder` — If `true`, the keys can be pressed in any order (e.g. `Shift+Control` as well as `Control+Shift`),
 *   as long as they all end up held down together. Disabled by default, requiring `keys` to be pressed in order.
 *
 * @example
 * ```ts
 * createShortcut(["CONTROL", "SHIFT", "C"], () => {
 *    console.log("Ctrl+Shift+C was pressed");
 * });
 *
 * // won't fire while typing in a text field
 * createShortcut(["S"], () => console.log("S was pressed"), { ignoreWithinInputs: true });
 *
 * // triggers for both Control+Shift+M and Shift+Control+M
 * createShortcut(["Control", "Shift", "M"], () => console.log("M was pressed"), { anyOrder: true });
 * ```
 */
export declare function createShortcut(keys: KbdKey[], callback: (event: KeyboardEvent | null) => void, options?: {
  preventDefault?: boolean;
  requireReset?: boolean;
  ignoreWithinInputs?: boolean;
  anyOrder?: boolean;
}): void;
export interface CreateKeyDownOptions {
  /** Whether the listener should be inactive. */
  disabled?: MaybeAccessor<boolean | undefined>;
  /** The document to attach the listener to. Defaults to `window.document`. Useful for iframes. */
  ownerDocument?: Accessor<Document | undefined>;
}
/**
 * Listens for a keydown event for a specific key on a document.
 * Supports a custom `ownerDocument` for use in iframes and portals.
 *
 * @param key The key to listen for (matched against `event.key`).
 * @param callback Handler called when the key is pressed.
 * @param options `disabled` and `ownerDocument` accessors.
 *
 * @example
 * ```ts
 * createKeyDown("Escape", e => close(), {
 *   ownerDocument: () => iframeEl.contentDocument ?? document,
 * });
 * ```
 */
export declare function createKeyDown(key: KbdKey, callback: (event: KeyboardEvent) => void, options?: CreateKeyDownOptions): void;
