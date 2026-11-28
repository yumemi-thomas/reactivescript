import { memo as _$memo } from "@solidjs/web";
import { scope as _$scope } from "@solidjs/web";
import { escape as _$escape } from "@solidjs/web";
import { ssrElement as _$ssrElement } from "@solidjs/web";
import { ssrElementAttribute as _$ssrElementAttribute } from "@solidjs/web";
import { mergeProps as _$mergeProps } from "@solidjs/web";
import { Show as _$Show } from "@solidjs/web";
var _sk$ = (k) => k === "class" || k === "style";
var _m$ = Symbol(), _m$2 = Symbol(), _m$3 = Symbol(), _m$4 = Symbol(), _m$5 = Symbol(), _m$6 = Symbol(), _m$7 = Symbol(), _m$8 = Symbol(), _m$9 = Symbol(), _m$10 = Symbol();
var _d$ = {
	get() {
		const v$rest = this[_m$];
		const v$attrs = this[_m$2];
		const v$on_ = this[_m$3];
		const v$classOf = this[_m$4];
		const v$props = this[_m$5];
		const v$now = this[_m$6];
		const v$styleOf = this[_m$7];
		return {
			...v$rest(),
			...v$attrs(),
			...v$on_(),
			"class": v$classOf(v$props?.class, v$now()),
			"style": v$styleOf(v$props?.style, v$now(), v$attrs()?.style)
		};
	},
	enumerable: true,
	configurable: true
}, _d$2 = {
	get() {
		const v$now = this[_m$6];
		return v$now();
	},
	enumerable: true,
	configurable: true
};
function _P$(_p, _p2, _p3, _p4, _p5, _p6, _p7) {
	this[_m$] = _p;
	this[_m$2] = _p2;
	this[_m$3] = _p3;
	this[_m$4] = _p4;
	this[_m$5] = _p5;
	this[_m$6] = _p6;
	this[_m$7] = _p7;
	Object.defineProperty(this, "attrs", _d$);
	Object.defineProperty(this, "state", _d$2);
}
_P$.prototype = Object.prototype;
var _d$3 = {
	get() {
		const v$props = this[_m$];
		return typeof v$props.element === "function";
	},
	enumerable: true,
	configurable: true
}, _d$4 = {
	get() {
		const __rt = this[_m$2];
		const v$rest = this[_m$3];
		const v$attrs = this[_m$4];
		const v$on_ = this[_m$5];
		const v$props = this[_m$];
		const v$now = this[_m$6];
		const v$classOf = this[_m$7];
		const v$styleOf = this[_m$8];
		const __o = __rt.owner();
		return _$ssrElement("button", [
			v$rest,
			v$attrs,
			v$on_
		], () => {
			return _$scope(() => {
				return _$escape(__rt.view(v$props.children, (V$view) => V$view(_$mergeProps(() => {
					return v$now();
				})), true));
			});
		}, true, _sk$, () => _$ssrElementAttribute("class", v$classOf(v$props?.class, v$now())) + _$ssrElementAttribute("style", v$styleOf(v$props?.style, v$now(), v$attrs()?.style)));
	},
	enumerable: true,
	configurable: true
};
function _P$2(_p8, _p9, _p0, _p1, _p10, _p11, _p12, _p13, _p14) {
	this[_m$] = _p8;
	this[_m$2] = _p9;
	this[_m$3] = _p0;
	this[_m$4] = _p1;
	this[_m$5] = _p10;
	this[_m$6] = _p11;
	this[_m$7] = _p12;
	this[_m$8] = _p13;
	Object.defineProperty(this, "when", _d$3);
	Object.defineProperty(this, "fallback", _d$4);
	this.children = _p14;
}
_P$2.prototype = Object.prototype;
var _d$5 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$6 = {
	get() {
		const __rt = this[_m$];
		const v$rest = this[_m$3];
		const v$attrs = this[_m$4];
		const v$on_ = this[_m$5];
		const v$viewOf = this[_m$6];
		const v$props = this[_m$7];
		const v$now = this[_m$8];
		const v$classOf = this[_m$9];
		const v$styleOf = this[_m$10];
		const __o = __rt.owner();
		return _$ssrElement("span", [
			v$rest,
			v$attrs,
			v$on_
		], () => {
			return _$scope(() => {
				return _$escape(__rt.show(v$viewOf(v$props?.children, v$now())));
			});
		}, true, _sk$, () => _$ssrElementAttribute("class", v$classOf(v$props?.class, v$now())) + _$ssrElementAttribute("style", v$styleOf(v$props?.style, v$now(), v$attrs()?.style)));
	},
	enumerable: true,
	configurable: true
};
function _P$3(_p15, _p16, _p17, _p18, _p19, _p20, _p21, _p22, _p23, _p24, _p25) {
	this[_m$] = _p15;
	this[_m$2] = _p16;
	this[_m$3] = _p17;
	this[_m$4] = _p18;
	this[_m$5] = _p19;
	this[_m$6] = _p20;
	this[_m$7] = _p21;
	this[_m$8] = _p22;
	this[_m$9] = _p23;
	this[_m$10] = _p24;
	Object.defineProperty(this, "when", _d$5);
	Object.defineProperty(this, "fallback", _d$6);
	this.children = _p25;
}
_P$3.prototype = Object.prototype;
var _d$7 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$8 = {
	get() {
		const __rt = this[_m$];
		const v$rest = this[_m$3];
		const v$attrs = this[_m$4];
		const v$on_ = this[_m$5];
		const v$viewOf = this[_m$6];
		const v$props = this[_m$7];
		const v$now = this[_m$8];
		const v$classOf = this[_m$9];
		const v$styleOf = this[_m$10];
		const __o = __rt.owner();
		return _$ssrElement("div", [
			v$rest,
			v$attrs,
			v$on_
		], () => {
			return _$scope(() => {
				return _$escape(__rt.show(v$viewOf(v$props?.children, v$now())));
			});
		}, true, _sk$, () => _$ssrElementAttribute("class", v$classOf(v$props?.class, v$now())) + _$ssrElementAttribute("style", v$styleOf(v$props?.style, v$now(), v$attrs()?.style)));
	},
	enumerable: true,
	configurable: true
};
function _P$4(_p26, _p27, _p28, _p29, _p30, _p31, _p32, _p33, _p34, _p35, _p36) {
	this[_m$] = _p26;
	this[_m$2] = _p27;
	this[_m$3] = _p28;
	this[_m$4] = _p29;
	this[_m$5] = _p30;
	this[_m$6] = _p31;
	this[_m$7] = _p32;
	this[_m$8] = _p33;
	this[_m$9] = _p34;
	this[_m$10] = _p35;
	Object.defineProperty(this, "when", _d$7);
	Object.defineProperty(this, "fallback", _d$8);
	this.children = _p36;
}
_P$4.prototype = Object.prototype;
import __m0 from "./part.ssr.js";
import { fire as w$fire, give as w$give, setOptions as w$setOptions } from "./bridge.js";
import { create as w$create, uniqueId as w$uniqueId, binder as w$binder, elementProps as w$elementProps } from "./bridge.js";
import { apiOf as w$apiOf, classOf as w$classOf, styleOf as w$styleOf, viewOf as w$viewOf } from "./bridge.js";
import { toggle as w$toggle, toggleGroup as w$toggleGroup } from "./core.js";
export default function module(__rt) {
	const __B = __rt.B;
	const __o = __rt.owner();
	const __i0 = __rt.module(__m0, __m0);
	const v$usePart = __i0["usePart"];
	const v$fire = w$fire;
	const v$give = w$give;
	const v$setOptions = w$setOptions;
	const v$create = w$create;
	const v$uniqueId = w$uniqueId;
	const v$binder = w$binder;
	const v$elementProps = w$elementProps;
	const v$apiOf = w$apiOf;
	const v$classOf = w$classOf;
	const v$styleOf = w$styleOf;
	const v$viewOf = w$viewOf;
	const v$toggle = w$toggle;
	const v$toggleGroup = w$toggleGroup;
	const v$group = __rt.context("group", () => null);
	const v$root = __rt.context("root", null);
	function V$Toggle(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$pressed = __rt.memo("pressed", (__prev) => v$props?.pressed, undefined);
			const v$defaultPressed = __rt.memo("defaultPressed", (__prev) => v$props?.defaultPressed, undefined);
			const v$onPressedChange = __rt.memo("onPressedChange", (__prev) => v$props?.onPressedChange, undefined);
			const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
			const v$disabled = __rt.memo("disabled", (__prev) => v$props?.disabled, undefined);
			const v$focusableWhenDisabled = __rt.memo("focusableWhenDisabled", (__prev) => v$props?.focusableWhenDisabled, undefined);
			const v$controller = __rt.memo("controller", (__prev) => v$props?.controller, undefined);
			const v$debug = __rt.memo("debug", (__prev) => v$props?.debug, undefined);
			const v$shown = () => v$props?.children;
			const v$shownAs = __rt.memo("shownAs", (__prev) => v$props?.element, undefined);
			const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
			const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "pressed", "defaultPressed", "onPressedChange", "value", "disabled", "focusableWhenDisabled", "controller", "debug", "children", "element", "ref"), undefined);
			const v$inside = __rt.memo("inside", (__prev) => __rt.useGet(v$group, __o), undefined);
			const v$options = __rt.memo("options", (__prev) => ({
				"pressed": v$pressed(),
				"defaultPressed": v$defaultPressed(),
				"onPressedChange": v$onPressedChange(),
				"value": v$value(),
				"disabled": v$disabled(),
				"focusableWhenDisabled": v$focusableWhenDisabled(),
				"group": __rt.eq(v$inside(), null) ? undefined : () => v$apiOf(v$inside()),
				"controller": v$controller(),
				"debug": v$debug()
			}), undefined);
			const r$it = __rt.inst(() => v$create(__rt.untrack(() => v$toggle), v$options));
			const v$it = () => r$it;
			const v$$$1 = v$usePart(v$it, __rt.untrack(() => "root"), __rt.memo(null, () => ({})), v$rest, v$options);
			const v$part = __rt.memo("part", (__prev) => v$$$1()?.part, undefined);
			const v$attrs = __rt.memo("attrs", (__prev) => v$$$1()?.attrs, undefined);
			const v$now = __rt.memo("now", (__prev) => v$$$1()?.now, undefined);
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({
				"ref": (v$e) => {
					__rt.snapshot(v$bind)(v$e);
					v$give(__rt.snapshot(v$user), v$e);
				},
				"onClick": (v$e) => {
					v$fire(__rt.snapshot(v$part), "click", v$e, v$props?.onClick);
				},
				"onKeyDown": (v$e) => {
					v$fire(__rt.snapshot(v$part), "keydown", v$e, v$props?.onKeyDown);
				},
				"onKeyUp": (v$e) => {
					v$fire(__rt.snapshot(v$part), "keyup", v$e, v$props?.onKeyUp);
				}
			}), undefined);
			__rt.provide(v$root, { get: __rt.memo(null, () => ({
				"it": v$it(),
				"options": v$options()
			})) });
			__rt.effect(2, () => [v$it(), v$options()], ($p) => __rt.untrack(() => {
				return v$setOptions($p[0], $p[1]);
			}));
			return _$Show(new _P$2(v$props, __rt, v$rest, v$attrs, v$on_, v$now, v$classOf, v$styleOf, (__item) => {
				const __o = __rt.owner();
				return _$memo(() => {
					return __rt.view(v$props.element, (V$view) => V$view(new _P$(v$rest, v$attrs, v$on_, v$classOf, v$props, v$now, v$styleOf)));
				});
			}));
		});
	}
	function V$ToggleIcon(v$props) {
		const __o = __rt.owner();
		const v$mirror = __rt.memo("mirror", (__prev) => v$props?.mirror, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "mirror", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$root, __o), undefined);
		const r$id = __rt.inst(() => v$uniqueId());
		const v$id = () => r$id;
		const v$$$2 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "icon"), __rt.memo(null, () => ({
			"mirror": v$mirror(),
			"id": v$props?.id ?? v$id()
		})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$2()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$2()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$2()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
			__rt.snapshot(v$bind)(v$e);
			v$give(__rt.snapshot(v$user), v$e);
		} }), undefined);
		return _$Show(new _P$3(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
			const __o = __rt.owner();
			const r$all = __rt.inst(() => v$elementProps(v$rest, __rt.memo(null, () => ({
				...v$attrs(),
				...v$on_(),
				"class": v$classOf(v$props?.class, v$now()),
				"style": v$styleOf(v$props?.style, v$now(), v$attrs()?.style)
			})), __rt.untrack(() => __rt.untrack(() => v$props)), __rt.untrack(() => __rt.untrack(() => v$now()))));
			const v$all = () => r$all;
			return _$memo(() => {
				return __rt.show(v$viewOf(v$render()(v$all(), v$now())));
			});
		}));
	}
	function V$ToggleGroup(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
			const v$defaultValue = __rt.memo("defaultValue", (__prev) => v$props?.defaultValue, undefined);
			const v$onValueChange = __rt.memo("onValueChange", (__prev) => v$props?.onValueChange, undefined);
			const v$multiple = __rt.memo("multiple", (__prev) => v$props?.multiple, undefined);
			const v$deselectable = __rt.memo("deselectable", (__prev) => v$props?.deselectable, undefined);
			const v$disabled = __rt.memo("disabled", (__prev) => v$props?.disabled, undefined);
			const v$orientation = __rt.memo("orientation", (__prev) => v$props?.orientation, undefined);
			const v$loop = __rt.memo("loop", (__prev) => v$props?.loop, undefined);
			const v$controller = __rt.memo("controller", (__prev) => v$props?.controller, undefined);
			const v$debug = __rt.memo("debug", (__prev) => v$props?.debug, undefined);
			const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
			const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
			const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "value", "defaultValue", "onValueChange", "multiple", "deselectable", "disabled", "orientation", "loop", "controller", "debug", "render", "ref"), undefined);
			const v$options = __rt.memo("options", (__prev) => ({
				"value": __rt.eq(v$value(), undefined) ? undefined : [...v$value()],
				"defaultValue": v$defaultValue(),
				"onValueChange": v$onValueChange(),
				"multiple": v$multiple(),
				"deselectable": v$deselectable(),
				"disabled": v$disabled(),
				"orientation": v$orientation(),
				"loop": v$loop(),
				"controller": v$controller(),
				"debug": v$debug()
			}), undefined);
			const r$it = __rt.inst(() => v$create(__rt.untrack(() => v$toggleGroup), v$options));
			const v$it = () => r$it;
			const v$$$3 = v$usePart(v$it, __rt.untrack(() => "group"), __rt.memo(null, () => ({})), v$rest, v$options);
			const v$part = __rt.memo("part", (__prev) => v$$$3()?.part, undefined);
			const v$attrs = __rt.memo("attrs", (__prev) => v$$$3()?.attrs, undefined);
			const v$now = __rt.memo("now", (__prev) => v$$$3()?.now, undefined);
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			} }), undefined);
			__rt.provide(v$group, { get: __rt.memo(null, () => v$it()) });
			__rt.effect(2, () => [v$it(), v$options()], ($p) => __rt.untrack(() => {
				return v$setOptions($p[0], $p[1]);
			}));
			return _$Show(new _P$4(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
				const __o = __rt.owner();
				const r$all = __rt.inst(() => v$elementProps(v$rest, __rt.memo(null, () => ({
					...v$attrs(),
					...v$on_(),
					"class": v$classOf(v$props?.class, v$now()),
					"style": v$styleOf(v$props?.style, v$now(), v$attrs()?.style)
				})), __rt.untrack(() => __rt.untrack(() => v$props)), __rt.untrack(() => __rt.untrack(() => v$now()))));
				const v$all = () => r$all;
				return _$memo(() => {
					return __rt.show(v$viewOf(v$render()(v$all(), v$now())));
				});
			}));
		});
	}
	return {
		"Toggle": V$Toggle,
		"ToggleIcon": V$ToggleIcon,
		"ToggleGroup": V$ToggleGroup
	};
}
//# sourceMappingURL=toggle.ssr.js.map
