export * from "@solid-primitives/controlled-signal";
import { createControllableSignal as rx, createToggleState as rxToggle } from "../dist/core.js";
/** The original takes each prop as an accessor. */
const read = (f: any) => (typeof f === "function" ? f() : f);
export const createControllableSignal = (p: any) => rx(() => ({ value: read(p.value), defaultValue: read(p.defaultValue), onChange: p.onChange }) as any);
export const createToggleState = (p: any = {}) => { const s = rxToggle(() => ({ isSelected: read(p.isSelected), defaultIsSelected: read(p.defaultIsSelected), onSelectedChange: p.onSelectedChange, isDisabled: read(p.isDisabled), isReadOnly: read(p.isReadOnly) }) as any); return { isSelected: s.isSelected, setIsSelected: s.setIsSelected, toggle: s.toggle }; };
