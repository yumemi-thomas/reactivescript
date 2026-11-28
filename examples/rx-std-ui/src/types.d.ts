import type { DialogBackdropState, DialogCloseProps as CloseNamed, DialogCloseState, DialogContentProps as ContentNamed, DialogContentState, DialogOptions, DialogShortcutProps as ShortcutNamed, DialogShortcutState, DialogTriggerProps as TriggerNamed, DialogTriggerState } from "@ui-sdk/core/dialog";
import type { TabsOptions, TabsState } from "@ui-sdk/core/tabs";
import type { toggle, toggleGroup, ToggleGroupOptions, ToggleGroupState, ToggleOptions, ToggleState } from "@ui-sdk/core/toggle";
import type { JSX } from "@solidjs/web";
export type Named = Record<string, unknown>;
export type Scope = { it: Instance; options: object };
export type User = Record<string, unknown>;
export type Attrs = Record<string, any>;
export type Part = { el: Element | undefined; key: string };
export type Instance = { api: any; get: () => any };
/** A part's props: its element's, with what may be a function of the part's state. */
export type PartProps<Tag extends keyof JSX.IntrinsicElements, State = {}> = Omit<JSX.IntrinsicElements[Tag], "class" | "style" | "children"> & {
  class?: JSX.ClassValue | ((state: State) => JSX.ClassValue);
  style?: JSX.CSSProperties | string | ((state: State) => JSX.CSSProperties | string | undefined);
  render?: (props: Record<string, any>, state: State) => JSX.Element;
  children?: JSX.Element | ((state: State) => JSX.Element);
};

// The parts' props: core's own types, with the element's.
export type ToggleInstance = ReturnType<typeof toggle>;
export type ToggleGroupInstance = ReturnType<typeof toggleGroup>;
export type ToggleProps = ToggleOptions & Omit<PartProps<"button", ToggleState>, "value" | "defaultValue" | "type" | "onChange" | "onSelect">;
export type ToggleIconProps = PartProps<"span", { mirror: boolean }> & { mirror?: boolean };
export type ToggleGroupProps = ToggleGroupOptions<string> & Omit<PartProps<"div", ToggleGroupState<string>>, "defaultValue" | "onChange" | "onSelect">;
type PartOf<Tag extends "div" | "span" | "button", State, Named = {}> = Named & Omit<PartProps<Tag, State>, keyof Named>;
type Oriented = { orientation: "horizontal" | "vertical" };
export type TabsProps = PartOf<"div", TabsState<string>, TabsOptions<string>>;
export type TabsListProps = PartOf<"div", Oriented>;
export type TabsTabProps = PartOf<"button", { selected: boolean; disabled: boolean }, { value: string; disabled?: boolean }>;
export type TabsTabIconProps = PartOf<"span", { mirror: boolean }, { mirror?: boolean }>;
export type TabsIndicatorProps = PartOf<"span", Oriented & { direction: string }>;
export type TabsPanelProps = PartOf<"div", { selected: boolean }, { value: string; keepMounted?: boolean; hiddenUntilFound?: boolean }>;
export type Container = Element | DocumentFragment | null | undefined;
export type DialogProps = DialogOptions & { children?: JSX.Element };
export type DialogTriggerProps = Omit<PartProps<"button", DialogTriggerState>, "value" | "onChange"> & TriggerNamed;
export type DialogBackdropProps = PartProps<"div", DialogBackdropState>;
export type DialogContentProps = PartProps<"div", DialogContentState<unknown>> & ContentNamed;
export type DialogTitleProps = PartProps<"h2">;
export type DialogDescriptionProps = PartProps<"p">;
export type DialogCloseProps = Omit<PartProps<"button", DialogCloseState>, "value" | "action"> & CloseNamed;
export type DialogShortcutProps = PartProps<"span", DialogShortcutState> & ShortcutNamed;
