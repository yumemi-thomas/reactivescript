import { template as _$template } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { getNextElement as _$getNextElement } from "@solidjs/web";
import { ref as _$ref } from "@solidjs/web";
var _tmpl$ = /*#__PURE__*/_$template(`<button>child`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span>sibling`);
import { eventListener, createEventListenerMap } from "@solid-primitives/event-listener";
function Child() {
  eventListener(["click", () => {}]);
  createEventListenerMap(() => document, {
    click: () => {},
    keydown: () => {},
    focus: undefined
  });
  var _el$ = _$getNextElement(_tmpl$);
  _$ref(() => el => el.dataset.bound = "child", _el$);
  return _el$;
}
export default function App() {
  return [_$createComponent(Child, {}), (() => {
    var _el$2 = _$getNextElement(_tmpl$2);
    _$ref(() => el => el.dataset.bound = "sibling", _el$2);
    return _el$2;
  })()];
}