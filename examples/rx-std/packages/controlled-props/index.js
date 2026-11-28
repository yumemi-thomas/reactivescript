import { createSignal } from "solid-js";
import { BoolProp, NumberProp, RangeProp, SelectProp, StringProp } from "@rx-primitives/controlled-props/core";
export { BoolProp, NumberProp, RangeProp, SelectProp, StringProp };

const INITIAL = { boolean: false, number: 0, range: 0, string: "", object: undefined };
const FIELD = { boolean: BoolProp, number: NumberProp, range: RangeProp, string: StringProp };
// hands out a Solid signal and a component over it: a Signal is not a value .rx has
export function createControlledProp(name, options) {
  const record = options != null && typeof options === "object";
  const initial = record ? options.initialValue ?? INITIAL[options.type ?? "object"] : options;
  if (initial == null) throw new Error(`cannot get type for Prop ${name}`);
  const type = options.options ? "object" : options.type ?? typeof initial;
  const [value, setValue] = createSignal(initial, { ownedWrite: true, name });
  const { min, max, step } = record ? options : {};
  const Field = FIELD[type] ?? SelectProp;
  return [value, setValue, () => Field({ name, value, setValue, min, max, step, options: options.options ?? [initial] })];
}
export const createControlledProps = props => Object.entries(props).reduce((out, [name, options]) => {
  const [value, setValue, field] = createControlledProp(name, options);
  out[0][name] = value; out[0][`set${name.slice(0, 1).toUpperCase()}${name.slice(1)}`] = setValue; out[1].push(field({}));
  return out;
}, [{}, []]);
