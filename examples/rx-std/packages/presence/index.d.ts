// The original package's types (@solid-primitives/presence, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { Accessor } from "solid-js";
import { MaybeAccessor } from "@solid-primitives/utils";
export type SharedTransitionConfig = {
  /** Duration in milliseconds used both for enter and exit transitions. */
  transitionDuration: MaybeAccessor<number>;
};
export type SeparateTransitionConfig = {
  /** Duration in milliseconds used for enter transitions (overrides `transitionDuration` if provided). */
  enterDuration: MaybeAccessor<number>;
  /** Duration in milliseconds used for exit transitions (overrides `transitionDuration` if provided). */
  exitDuration: MaybeAccessor<number>;
};
export type Options = (SharedTransitionConfig | SeparateTransitionConfig | (SharedTransitionConfig & SeparateTransitionConfig)) & {
  /** Opt-in to animating the entering of an element if `isVisible` is `true` during the initial mount. */
  initialEnter?: boolean;
};
/**
 * The result of {@link createPresence}.
 */
export type PresenceResult<TItem> = {
  /** Should the component be returned from render? */
  isMounted: Accessor<boolean>;
  /** The item that is currently mounted. */
  mountedItem: Accessor<TItem | undefined>;
  /** Should the component have its visible styles applied? */
  isVisible: Accessor<boolean>;
  /** Is the component either entering or exiting currently? */
  isAnimating: Accessor<boolean>;
  /** Is the component entering currently? */
  isEntering: Accessor<boolean>;
  /** Is the component exiting currently? */
  isExiting: Accessor<boolean>;
  /**
   * Ends the current enter or exit transition right away instead of waiting for its duration, which
   * then only acts as a fallback timeout. Pass it as an `onTransitionEnd` / `onAnimationEnd` handler,
   * or call it yourself. Events bubbling up from descendants are ignored. Does nothing while no
   * transition is running.
   *
   * It ends whichever transition is running when it is called: a late call (e.g. from a JS
   * animation that was started for an earlier transition) ends the newer one. For callbacks that
   * can outlive their transition, use {@link PresenceResult.bindDone}.
   */
  done: (event?: Event) => void;
  /**
   * Returns a `done` bound to the transition that is running now. Once the item has changed again,
   * calling it does nothing, so a late completion callback of an obsolete animation cannot end the
   * newer transition. Call it once the transition has started (e.g. where you start the animation,
   * from an effect on `isEntering()` / `isExiting()`): it binds to the state as of the last flush, so
   * a call made right after changing the item, before that change is flushed, binds to the previous
   * transition and its callback is then ignored (the duration still ends the transition).
   */
  bindDone: () => (event?: Event) => void;
};
/**
 * Utility to animate the presence of an element based on the existence of data or lack thereof.
 *
 * @param item a reactive value driving the transition
 * @param options options to configure the transition, see {@link Options}
 * @returns an object with reactive accessors representing the state of the transition. See {@link PresenceResult}.
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/presence#createPresence
 *
 * @example
 * ```ts
 * const items = ["foo", "bar", "baz", "qux"];
 * const [activeItem, setActiveItem] = createSignal(items[0]);
 * const presence = createPresence(activeItem);
 * ```
 */
export declare function createPresence<TItem>(item: Accessor<TItem | undefined>, options: Options): PresenceResult<TItem>;
