import { combineProps } from "@solid-primitives/props";
import { insert } from "@solidjs/web";
export function Button(props) {
  const all = combineProps({ class: "button", onClick: () => props.onPress?.() }, { get class() { return props.class; } });
  const el = document.createElement("button");
  el.className = all.class;
  el.addEventListener("click", e => all.onClick(e));
  insert(el, () => props.children);
  return el;
}
