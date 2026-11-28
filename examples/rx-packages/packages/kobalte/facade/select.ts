import { merge } from "solid-js";
import { Root as One, Multiple, Value as Shown, Option } from "../dist/select.js";
export { Label, Description, ErrorMessage, Trigger, Icon, Page as Portal, Content, Listbox, ItemLabel, ItemIndicator, HiddenSelect } from "../dist/select.js";
export const Root = (props: any) => props.multiple ? Multiple(props) : One(props);
export const Item = Option;
export const Value = (props: any) => Shown(merge(props, { children: (s: any) => (() => props.children({ selectedOption: () => s.selectedOption, selectedOptions: () => s.selectedOptions, clear: s.clear, remove: s.remove })) as any }) as any);
