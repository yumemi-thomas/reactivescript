import { template as _$template } from "@solidjs/web";
import { getNextElement as _$getNextElement } from "@solidjs/web";
import { scope as _$scope } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div id=out data-testid=out><span></span><button type=button>toggle`);
import { createControllableSignal } from "@solid-primitives/controlled-signal";
export default function App() {
  const [value] = createControllableSignal({
    defaultValue: () => "hello"
  });
  var _el$ = _$getNextElement(_tmpl$),
    _el$2 = _el$.firstChild;
  _$insert(_el$2, _$scope(() => value()));
  return _el$;
}