import { memo as _$memo } from "@solidjs/web";
import { scope as _$scope } from "@solidjs/web";
import { escape as _$escape } from "@solidjs/web";
import { ssrElement as _$ssrElement } from "@solidjs/web";
import { ssrElementAttribute as _$ssrElementAttribute } from "@solidjs/web";
import { mergeProps as _$mergeProps } from "@solidjs/web";
import { Show as _$Show } from "@solidjs/web";
var _sk$ = (k) => k === "class" || k === "style";
var _m$ = Symbol(), _m$2 = Symbol(), _m$3 = Symbol(), _m$4 = Symbol(), _m$5 = Symbol(), _m$6 = Symbol(), _m$7 = Symbol(), _m$8 = Symbol(), _m$9 = Symbol(), _m$10 = Symbol(), _m$11 = Symbol(), _m$12 = Symbol(), _m$13 = Symbol(), _m$14 = Symbol(), _m$15 = Symbol(), _m$16 = Symbol();
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
			"style": v$styleOf(v$props?.style, v$now(), undefined)
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
		}, true, _sk$, () => _$ssrElementAttribute("class", v$classOf(v$props?.class, v$now())) + _$ssrElementAttribute("style", v$styleOf(v$props?.style, v$now(), undefined)));
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
}, _d$6 = {
	get() {
		const v$now = this[_m$6];
		return v$now();
	},
	enumerable: true,
	configurable: true
};
function _P$3(_p15, _p16, _p17, _p18, _p19, _p20, _p21) {
	this[_m$] = _p15;
	this[_m$2] = _p16;
	this[_m$3] = _p17;
	this[_m$4] = _p18;
	this[_m$5] = _p19;
	this[_m$6] = _p20;
	this[_m$7] = _p21;
	Object.defineProperty(this, "attrs", _d$5);
	Object.defineProperty(this, "state", _d$6);
}
_P$3.prototype = Object.prototype;
var _d$7 = {
	get() {
		const v$props = this[_m$];
		return typeof v$props.element === "function";
	},
	enumerable: true,
	configurable: true
}, _d$8 = {
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
function _P$4(_p22, _p23, _p24, _p25, _p26, _p27, _p28, _p29, _p30) {
	this[_m$] = _p22;
	this[_m$2] = _p23;
	this[_m$3] = _p24;
	this[_m$4] = _p25;
	this[_m$5] = _p26;
	this[_m$6] = _p27;
	this[_m$7] = _p28;
	this[_m$8] = _p29;
	Object.defineProperty(this, "when", _d$7);
	Object.defineProperty(this, "fallback", _d$8);
	this.children = _p30;
}
_P$4.prototype = Object.prototype;
var _d$9 = {
	get() {
		const __rt = this[_m$];
		const v$target = this[_m$2];
		return !__rt.eq(v$target(), null);
	},
	enumerable: true,
	configurable: true
}, _d$10 = {
	get() {
		const __rt = this[_m$];
		const v$disabled = this[_m$3];
		const v$focusableWhenDisabled = this[_m$4];
		const v$give = this[_m$5];
		const v$user = this[_m$6];
		const v$props = this[_m$7];
		const v$rest = this[_m$8];
		const v$classOf = this[_m$9];
		const v$styleOf = this[_m$10];
		const __o = __rt.owner();
		const v$now = __rt.memo("now", (__prev) => ({
			"open": false,
			"disabled": !!v$disabled()
		}), undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => ({
			"type": "button",
			"disabled": v$disabled() && !v$focusableWhenDisabled(),
			"aria-disabled": v$disabled() && v$focusableWhenDisabled() || undefined
		}), undefined);
		const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
			v$give(__rt.snapshot(v$user), v$e);
		} }), undefined);
		return _$Show(new _P$2(v$props, __rt, v$rest, v$attrs, v$on_, v$now, v$classOf, v$styleOf, (__item) => {
			const __o = __rt.owner();
			return _$memo(() => {
				return __rt.view(v$props.element, (V$view) => V$view(new _P$(v$rest, v$attrs, v$on_, v$classOf, v$props, v$now, v$styleOf)));
			});
		}));
	},
	enumerable: true,
	configurable: true
};
function _P$5(_p31, _p32, _p33, _p34, _p35, _p36, _p37, _p38, _p39, _p40, _p41) {
	this[_m$] = _p31;
	this[_m$2] = _p32;
	this[_m$3] = _p33;
	this[_m$4] = _p34;
	this[_m$5] = _p35;
	this[_m$6] = _p36;
	this[_m$7] = _p37;
	this[_m$8] = _p38;
	this[_m$9] = _p39;
	this[_m$10] = _p40;
	Object.defineProperty(this, "when", _d$9);
	Object.defineProperty(this, "fallback", _d$10);
	this.children = _p41;
}
_P$5.prototype = Object.prototype;
var _d$11 = {
	get() {
		const v$target = this[_m$];
		return v$target();
	},
	enumerable: true,
	configurable: true
}, _d$12 = {
	get() {
		const __rt = this[_m$2];
		const v$props = this[_m$3];
		return __rt.kids(v$props?.children);
	},
	enumerable: true,
	configurable: true
};
function _P$6(_p42, _p43, _p44) {
	this[_m$] = _p42;
	this[_m$2] = _p43;
	this[_m$3] = _p44;
	Object.defineProperty(this, "mount", _d$11);
	Object.defineProperty(this, "children", _d$12);
}
_P$6.prototype = Object.prototype;
var _d$13 = {
	get() {
		const __rt = this[_m$];
		const v$target = this[_m$2];
		return !__rt.eq(v$target(), null);
	},
	enumerable: true,
	configurable: true
}, _d$14 = {
	get() {
		const __rt = this[_m$];
		const v$props = this[_m$3];
		const __o = __rt.owner();
		return _$memo(() => {
			return __rt.kids(v$props?.children);
		});
	},
	enumerable: true,
	configurable: true
};
function _P$7(_p45, _p46, _p47, _p48) {
	this[_m$] = _p45;
	this[_m$2] = _p46;
	this[_m$3] = _p47;
	Object.defineProperty(this, "when", _d$13);
	Object.defineProperty(this, "fallback", _d$14);
	this.children = _p48;
}
_P$7.prototype = Object.prototype;
var _d$15 = {
	get() {
		const v$present = this[_m$];
		return v$present();
	},
	enumerable: true,
	configurable: true
}, _d$16 = {
	get() {
		const __rt = this[_m$2];
		const v$props = this[_m$3];
		const __o = __rt.owner();
		return _$memo(() => {
			return __rt.kids(v$props?.children);
		});
	},
	enumerable: true,
	configurable: true
};
function _P$8(_p49, _p50, _p51, _p52) {
	this[_m$] = _p49;
	this[_m$2] = _p50;
	this[_m$3] = _p51;
	Object.defineProperty(this, "when", _d$15);
	Object.defineProperty(this, "fallback", _d$16);
	this.children = _p52;
}
_P$8.prototype = Object.prototype;
var _d$17 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$18 = {
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
function _P$9(_p53, _p54, _p55, _p56, _p57, _p58, _p59, _p60, _p61, _p62, _p63) {
	this[_m$] = _p53;
	this[_m$2] = _p54;
	this[_m$3] = _p55;
	this[_m$4] = _p56;
	this[_m$5] = _p57;
	this[_m$6] = _p58;
	this[_m$7] = _p59;
	this[_m$8] = _p60;
	this[_m$9] = _p61;
	this[_m$10] = _p62;
	Object.defineProperty(this, "when", _d$17);
	Object.defineProperty(this, "fallback", _d$18);
	this.children = _p63;
}
_P$9.prototype = Object.prototype;
var _d$19 = {
	get() {
		const v$own_ = this[_m$];
		const v$outer = this[_m$2];
		return v$own_() ?? v$outer();
	},
	enumerable: true,
	configurable: true
}, _d$20 = {
	get() {
		const __rt = this[_m$3];
		const v$render = this[_m$4];
		const v$rest = this[_m$5];
		const v$attrs = this[_m$6];
		const v$on_ = this[_m$7];
		const v$viewOf = this[_m$8];
		const v$props = this[_m$9];
		const v$now = this[_m$10];
		const v$classOf = this[_m$11];
		const v$styleOf = this[_m$12];
		const v$elementProps = this[_m$13];
		return __rt.slot(() => {
			const __o = __rt.owner();
			return _$Show(new _P$9(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
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
	},
	enumerable: true,
	configurable: true
};
function _P$10(_p64, _p65, _p66, _p67, _p68, _p69, _p70, _p71, _p72, _p73, _p74, _p75, _p76) {
	this[_m$] = _p64;
	this[_m$2] = _p65;
	this[_m$3] = _p66;
	this[_m$4] = _p67;
	this[_m$5] = _p68;
	this[_m$6] = _p69;
	this[_m$7] = _p70;
	this[_m$8] = _p71;
	this[_m$9] = _p72;
	this[_m$10] = _p73;
	this[_m$11] = _p74;
	this[_m$12] = _p75;
	this[_m$13] = _p76;
	Object.defineProperty(this, "inside", _d$19);
	Object.defineProperty(this, "children", _d$20);
}
_P$10.prototype = Object.prototype;
var _d$21 = {
	get() {
		const v$present = this[_m$];
		return v$present();
	},
	enumerable: true,
	configurable: true
}, _d$22 = {
	get() {
		const __rt = this[_m$2];
		const __o = __rt.owner();
		return null;
	},
	enumerable: true,
	configurable: true
};
function _P$11(_p77, _p78, _p79) {
	this[_m$] = _p77;
	this[_m$2] = _p78;
	Object.defineProperty(this, "when", _d$21);
	Object.defineProperty(this, "fallback", _d$22);
	this.children = _p79;
}
_P$11.prototype = Object.prototype;
var _d$23 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$24 = {
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
function _P$12(_p80, _p81, _p82, _p83, _p84, _p85, _p86, _p87, _p88, _p89, _p90) {
	this[_m$] = _p80;
	this[_m$2] = _p81;
	this[_m$3] = _p82;
	this[_m$4] = _p83;
	this[_m$5] = _p84;
	this[_m$6] = _p85;
	this[_m$7] = _p86;
	this[_m$8] = _p87;
	this[_m$9] = _p88;
	this[_m$10] = _p89;
	Object.defineProperty(this, "when", _d$23);
	Object.defineProperty(this, "fallback", _d$24);
	this.children = _p90;
}
_P$12.prototype = Object.prototype;
var _d$25 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		const v$rest = this[_m$3];
		const v$attrs = this[_m$4];
		const v$on_ = this[_m$5];
		const v$viewOf = this[_m$6];
		const v$props = this[_m$7];
		const v$now = this[_m$8];
		const v$classOf = this[_m$9];
		const v$styleOf = this[_m$10];
		const v$elementProps = this[_m$11];
		return __rt.slot(() => {
			const __o = __rt.owner();
			return _$Show(new _P$12(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
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
	},
	enumerable: true,
	configurable: true
};
function _P$13(_p91, _p92, _p93, _p94, _p95, _p96, _p97, _p98, _p99, _p100, _p101) {
	this[_m$] = _p91;
	this[_m$2] = _p92;
	this[_m$3] = _p93;
	this[_m$4] = _p94;
	this[_m$5] = _p95;
	this[_m$6] = _p96;
	this[_m$7] = _p97;
	this[_m$8] = _p98;
	this[_m$9] = _p99;
	this[_m$10] = _p100;
	this[_m$11] = _p101;
	Object.defineProperty(this, "children", _d$25);
}
_P$13.prototype = Object.prototype;
var _d$26 = {
	get() {
		const v$container = this[_m$];
		const v$fromRoot = this[_m$2];
		const v$outer = this[_m$3];
		return v$container() ?? v$fromRoot() ?? v$outer();
	},
	enumerable: true,
	configurable: true
}, _d$27 = {
	get() {
		const v$inline = this[_m$4];
		return v$inline();
	},
	enumerable: true,
	configurable: true
}, _d$28 = {
	get() {
		const __rt = this[_m$5];
		const V$Viewport = this[_m$6];
		const v$render = this[_m$7];
		const v$rest = this[_m$8];
		const v$attrs = this[_m$9];
		const v$on_ = this[_m$10];
		const v$viewOf = this[_m$11];
		const v$props = this[_m$12];
		const v$now = this[_m$13];
		const v$classOf = this[_m$14];
		const v$styleOf = this[_m$15];
		const v$elementProps = this[_m$16];
		return __rt.slot(() => {
			const __o = __rt.owner();
			return V$Viewport(new _P$13(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, v$elementProps));
		});
	},
	enumerable: true,
	configurable: true
};
function _P$14(_p102, _p103, _p104, _p105, _p106, _p107, _p108, _p109, _p110, _p111, _p112, _p113, _p114, _p115, _p116, _p117) {
	this[_m$] = _p102;
	this[_m$2] = _p103;
	this[_m$3] = _p104;
	this[_m$4] = _p105;
	this[_m$5] = _p106;
	this[_m$6] = _p107;
	this[_m$7] = _p108;
	this[_m$8] = _p109;
	this[_m$9] = _p110;
	this[_m$10] = _p111;
	this[_m$11] = _p112;
	this[_m$12] = _p113;
	this[_m$13] = _p114;
	this[_m$14] = _p115;
	this[_m$15] = _p116;
	this[_m$16] = _p117;
	Object.defineProperty(this, "inside", _d$26);
	Object.defineProperty(this, "inline", _d$27);
	Object.defineProperty(this, "children", _d$28);
}
_P$14.prototype = Object.prototype;
var _d$29 = {
	get() {
		const v$present = this[_m$];
		return v$present();
	},
	enumerable: true,
	configurable: true
}, _d$30 = {
	get() {
		const __rt = this[_m$2];
		const __o = __rt.owner();
		return null;
	},
	enumerable: true,
	configurable: true
};
function _P$15(_p118, _p119, _p120) {
	this[_m$] = _p118;
	this[_m$2] = _p119;
	Object.defineProperty(this, "when", _d$29);
	Object.defineProperty(this, "fallback", _d$30);
	this.children = _p120;
}
_P$15.prototype = Object.prototype;
var _d$31 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$32 = {
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
		return _$ssrElement("h2", [
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
function _P$16(_p121, _p122, _p123, _p124, _p125, _p126, _p127, _p128, _p129, _p130, _p131) {
	this[_m$] = _p121;
	this[_m$2] = _p122;
	this[_m$3] = _p123;
	this[_m$4] = _p124;
	this[_m$5] = _p125;
	this[_m$6] = _p126;
	this[_m$7] = _p127;
	this[_m$8] = _p128;
	this[_m$9] = _p129;
	this[_m$10] = _p130;
	Object.defineProperty(this, "when", _d$31);
	Object.defineProperty(this, "fallback", _d$32);
	this.children = _p131;
}
_P$16.prototype = Object.prototype;
var _d$33 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$34 = {
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
		return _$ssrElement("p", [
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
function _P$17(_p132, _p133, _p134, _p135, _p136, _p137, _p138, _p139, _p140, _p141, _p142) {
	this[_m$] = _p132;
	this[_m$2] = _p133;
	this[_m$3] = _p134;
	this[_m$4] = _p135;
	this[_m$5] = _p136;
	this[_m$6] = _p137;
	this[_m$7] = _p138;
	this[_m$8] = _p139;
	this[_m$9] = _p140;
	this[_m$10] = _p141;
	Object.defineProperty(this, "when", _d$33);
	Object.defineProperty(this, "fallback", _d$34);
	this.children = _p142;
}
_P$17.prototype = Object.prototype;
var _d$35 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$36 = {
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
		return _$ssrElement("button", [
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
function _P$18(_p143, _p144, _p145, _p146, _p147, _p148, _p149, _p150, _p151, _p152, _p153) {
	this[_m$] = _p143;
	this[_m$2] = _p144;
	this[_m$3] = _p145;
	this[_m$4] = _p146;
	this[_m$5] = _p147;
	this[_m$6] = _p148;
	this[_m$7] = _p149;
	this[_m$8] = _p150;
	this[_m$9] = _p151;
	this[_m$10] = _p152;
	Object.defineProperty(this, "when", _d$35);
	Object.defineProperty(this, "fallback", _d$36);
	this.children = _p153;
}
_P$18.prototype = Object.prototype;
var _d$37 = {
	get() {
		const __rt = this[_m$];
		const v$render = this[_m$2];
		return !__rt.eq(v$render(), undefined);
	},
	enumerable: true,
	configurable: true
}, _d$38 = {
	get() {
		const __rt = this[_m$];
		const v$rest = this[_m$3];
		const v$attrs = this[_m$4];
		const v$on_ = this[_m$5];
		const v$viewOf = this[_m$6];
		const v$props = this[_m$7];
		const v$text = this[_m$8];
		const v$now = this[_m$9];
		const v$classOf = this[_m$10];
		const v$styleOf = this[_m$11];
		const __o = __rt.owner();
		return _$ssrElement("span", [
			v$rest,
			v$attrs,
			v$on_
		], () => {
			return _$scope(() => {
				return _$escape(__rt.show(v$viewOf(v$props?.children ?? v$text(), v$now())));
			});
		}, true, _sk$, () => _$ssrElementAttribute("class", v$classOf(v$props?.class, v$now())) + _$ssrElementAttribute("style", v$styleOf(v$props?.style, v$now(), v$attrs()?.style)));
	},
	enumerable: true,
	configurable: true
};
function _P$19(_p154, _p155, _p156, _p157, _p158, _p159, _p160, _p161, _p162, _p163, _p164, _p165) {
	this[_m$] = _p154;
	this[_m$2] = _p155;
	this[_m$3] = _p156;
	this[_m$4] = _p157;
	this[_m$5] = _p158;
	this[_m$6] = _p159;
	this[_m$7] = _p160;
	this[_m$8] = _p161;
	this[_m$9] = _p162;
	this[_m$10] = _p163;
	this[_m$11] = _p164;
	Object.defineProperty(this, "when", _d$37);
	Object.defineProperty(this, "fallback", _d$38);
	this.children = _p165;
}
_P$19.prototype = Object.prototype;
var _d$39 = {
	get() {
		const __rt = this[_m$];
		const v$target = this[_m$2];
		return !__rt.eq(v$target(), null);
	},
	enumerable: true,
	configurable: true
}, _d$40 = {
	get() {
		const __rt = this[_m$];
		const __o = __rt.owner();
		return null;
	},
	enumerable: true,
	configurable: true
};
function _P$20(_p166, _p167, _p168) {
	this[_m$] = _p166;
	this[_m$2] = _p167;
	Object.defineProperty(this, "when", _d$39);
	Object.defineProperty(this, "fallback", _d$40);
	this.children = _p168;
}
_P$20.prototype = Object.prototype;
import __m0 from "./part.ssr.js";
import { fire as w$fire, give as w$give, setOptions as w$setOptions } from "./bridge.js";
import { create as w$create, uniqueId as w$uniqueId, binder as w$binder, elementProps as w$elementProps, register as w$register, entryOf as w$entryOf } from "./bridge.js";
import { presentOf as w$presentOf } from "./bridge.js";
import { classOf as w$classOf, styleOf as w$styleOf, viewOf as w$viewOf, portalTarget as w$portalTarget } from "./bridge.js";
import { dialog as w$primitive } from "./core.js";
import { Portal as w$Portal } from "./portal.js";
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
	const v$register = w$register;
	const v$entryOf = w$entryOf;
	const v$presentOf = w$presentOf;
	const v$classOf = w$classOf;
	const v$styleOf = w$styleOf;
	const v$viewOf = w$viewOf;
	const v$portalTarget = w$portalTarget;
	const v$primitive = w$primitive;
	const V$Portal = w$Portal;
	const v$dialog = __rt.context("dialog", null);
	const v$nearest = __rt.context("nearest", () => null);
	const v$trigger = __rt.context("trigger", () => null);
	const v$rootContainer = __rt.context("rootContainer", () => undefined);
	const v$inherited = __rt.context("inherited", () => undefined);
	function V$Dialog(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$container = __rt.memo("container", (__prev) => v$props?.container, undefined);
			const v$open = __rt.memo("open", (__prev) => v$props?.open, undefined);
			const v$defaultOpen = __rt.memo("defaultOpen", (__prev) => v$props?.defaultOpen, undefined);
			const v$onOpenChange = __rt.memo("onOpenChange", (__prev) => v$props?.onOpenChange, undefined);
			const v$onOpenChangeComplete = __rt.memo("onOpenChangeComplete", (__prev) => v$props?.onOpenChangeComplete, undefined);
			const v$onPayloadChange = __rt.memo("onPayloadChange", (__prev) => v$props?.onPayloadChange, undefined);
			const v$dismissible = __rt.memo("dismissible", (__prev) => v$props?.dismissible, undefined);
			const v$onDismissAttempt = __rt.memo("onDismissAttempt", (__prev) => v$props?.onDismissAttempt, undefined);
			const v$closeOnOutsidePress = __rt.memo("closeOnOutsidePress", (__prev) => v$props?.closeOnOutsidePress, undefined);
			const v$persistentElements = __rt.memo("persistentElements", (__prev) => v$props?.persistentElements, undefined);
			const v$pendingAnnouncement = __rt.memo("pendingAnnouncement", (__prev) => v$props?.pendingAnnouncement, undefined);
			const v$modal = __rt.memo("modal", (__prev) => v$props?.modal, undefined);
			const v$presentation = __rt.memo("presentation", (__prev) => v$props?.presentation, undefined);
			const v$controller = __rt.memo("controller", (__prev) => v$props?.controller, undefined);
			const v$debug = __rt.memo("debug", (__prev) => v$props?.debug, undefined);
			const v$options = __rt.memo("options", (__prev) => ({
				"open": v$open(),
				"defaultOpen": v$defaultOpen(),
				"onOpenChange": v$onOpenChange(),
				"onOpenChangeComplete": v$onOpenChangeComplete(),
				"onPayloadChange": v$onPayloadChange(),
				"dismissible": v$dismissible(),
				"onDismissAttempt": v$onDismissAttempt(),
				"closeOnOutsidePress": v$closeOnOutsidePress(),
				"persistentElements": v$persistentElements(),
				"pendingAnnouncement": v$pendingAnnouncement(),
				"modal": v$modal(),
				"presentation": v$presentation(),
				"controller": v$controller(),
				"debug": v$debug()
			}), undefined);
			const r$it = __rt.inst(() => v$create(__rt.untrack(() => v$primitive), v$options));
			const v$it = () => r$it;
			const v$scope = __rt.memo("scope", (__prev) => ({
				"it": v$it(),
				"options": v$options()
			}), undefined);
			const r$registered = __rt.inst(() => v$register(v$controller, v$scope));
			const v$registered = () => r$registered;
			__rt.provide(v$dialog, { get: __rt.memo(null, () => v$scope()) });
			__rt.provide(v$nearest, { get: __rt.memo(null, () => v$scope()) });
			__rt.provide(v$rootContainer, { get: __rt.memo(null, () => v$container()) });
			__rt.effect(2, () => [v$it(), v$options()], ($p) => __rt.untrack(() => {
				return v$setOptions($p[0], $p[1]);
			}));
			return _$memo(() => {
				return __rt.show(v$viewOf(v$props?.children));
			});
		});
	}
	function V$DialogTrigger(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$disabled = __rt.memo("disabled", (__prev) => v$props?.disabled, undefined);
			const v$focusableWhenDisabled = __rt.memo("focusableWhenDisabled", (__prev) => v$props?.focusableWhenDisabled, undefined);
			const v$payload = __rt.memo("payload", (__prev) => v$props?.payload, undefined);
			const v$shortcut = __rt.memo("shortcut", (__prev) => v$props?.shortcut, undefined);
			const v$controller = __rt.memo("controller", (__prev) => v$props?.controller, undefined);
			const v$shown = () => v$props?.children;
			const v$shownAs = __rt.memo("shownAs", (__prev) => v$props?.element, undefined);
			const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
			const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "disabled", "focusableWhenDisabled", "payload", "shortcut", "controller", "children", "element", "ref"), undefined);
			const v$around = __rt.memo("around", (__prev) => __rt.useGet(v$nearest, __o), undefined);
			const r$named = __rt.inst(() => v$entryOf(v$controller));
			const v$named = r$named;
			const v$target = __rt.memo("target", (__prev) => v$named() ?? v$around(), undefined);
			__rt.provide(v$trigger, { get: __rt.memo(null, () => ({
				"shortcut": v$shortcut(),
				"target": v$target()
			})) });
			return _$Show(new _P$5(__rt, v$target, v$disabled, v$focusableWhenDisabled, v$give, v$user, v$props, v$rest, v$classOf, v$styleOf, (__item) => {
				const __o = __rt.owner();
				const r$id = __rt.inst(() => v$uniqueId());
				const v$id = () => r$id;
				const v$$$1 = v$usePart(__rt.memo(null, () => v$target()?.it), __rt.untrack(() => "trigger"), __rt.memo(null, () => ({
					"id": v$id(),
					"disabled": v$disabled(),
					"focusableWhenDisabled": v$focusableWhenDisabled(),
					"payload": v$payload(),
					"shortcut": v$shortcut()
				})), v$rest, __rt.memo(null, () => v$target()?.options));
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
					"onPointerEnter": (v$e) => {
						v$fire(__rt.snapshot(v$part), "pointerenter", v$e, v$props?.onPointerEnter);
					},
					"onPointerLeave": (v$e) => {
						v$fire(__rt.snapshot(v$part), "pointerleave", v$e, v$props?.onPointerLeave);
					},
					"onFocusIn": (v$e) => {
						v$fire(__rt.snapshot(v$part), "focusin", v$e, v$props?.onFocusIn);
					},
					"onFocusOut": (v$e) => {
						v$fire(__rt.snapshot(v$part), "focusout", v$e, v$props?.onFocusOut);
					},
					"onKeyDown": (v$e) => {
						v$fire(__rt.snapshot(v$part), "keydown", v$e, v$props?.onKeyDown);
					},
					"onClick": (v$e) => {
						v$fire(__rt.snapshot(v$part), "click", v$e, v$props?.onClick);
					}
				}), undefined);
				return _$Show(new _P$4(v$props, __rt, v$rest, v$attrs, v$on_, v$now, v$classOf, v$styleOf, (__item) => {
					const __o = __rt.owner();
					return _$memo(() => {
						return __rt.view(v$props.element, (V$view) => V$view(new _P$3(v$rest, v$attrs, v$on_, v$classOf, v$props, v$now, v$styleOf)));
					});
				}));
			}));
		});
	}
	function V$Popup(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$target = __rt.memo("target", (__prev) => v$props?.inline ? null : v$portalTarget(v$props?.inside), undefined);
			__rt.provide(v$inherited, { get: __rt.memo(null, () => v$props?.inside) });
			return _$Show(new _P$7(__rt, v$target, v$props, (__item) => {
				const __o = __rt.owner();
				return V$Portal(new _P$6(v$target, __rt, v$props));
			}));
		});
	}
	function V$Viewport(v$props) {
		const __o = __rt.owner();
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const v$named = __rt.memo("named", (__prev) => ({}), undefined);
		const v$$$2 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "viewport"), v$named, __rt.memo(null, () => ({})), __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$2()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$2()?.attrs, undefined);
		const v$tick = __rt.memo("tick", (__prev) => v$$$2()?.tick, undefined);
		const v$present = __rt.memo("present", (__prev) => v$presentOf(v$part(), v$named(), v$scope()?.options, v$tick()), undefined);
		return _$Show(new _P$8(v$present, __rt, v$props, (__item) => {
			const n$present = __item;
			const __o = __rt.owner();
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
			} }), undefined);
			return _$ssrElement("div", [v$attrs, v$on_], () => {
				return _$scope(() => {
					return _$escape(__rt.kids(v$props?.children));
				});
			}, true);
		}));
	}
	function V$DialogBackdrop(v$props) {
		const __o = __rt.owner();
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const v$own_ = __rt.memo("own_", (__prev) => __rt.useGet(v$rootContainer, __o), undefined);
		const v$outer = __rt.memo("outer", (__prev) => __rt.useGet(v$inherited, __o), undefined);
		const v$named = __rt.memo("named", (__prev) => ({}), undefined);
		const v$$$3 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "backdrop"), v$named, v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$3()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$3()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$3()?.now, undefined);
		const v$tick = __rt.memo("tick", (__prev) => v$$$3()?.tick, undefined);
		const v$present = __rt.memo("present", (__prev) => v$presentOf(v$part(), v$named(), v$scope()?.options, v$tick()), undefined);
		return _$Show(new _P$11(v$present, __rt, (__item) => {
			const n$present = __item;
			const __o = __rt.owner();
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			} }), undefined);
			return V$Popup(new _P$10(v$own_, v$outer, __rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, v$elementProps));
		}));
	}
	function V$DialogContent(v$props) {
		const __o = __rt.owner();
		const v$initialFocus = __rt.memo("initialFocus", (__prev) => v$props?.initialFocus, undefined);
		const v$finalFocus = __rt.memo("finalFocus", (__prev) => v$props?.finalFocus, undefined);
		const v$keepMounted = __rt.memo("keepMounted", (__prev) => v$props?.keepMounted, undefined);
		const v$inline = __rt.memo("inline", (__prev) => v$props?.inline, undefined);
		const v$container = __rt.memo("container", (__prev) => v$props?.container, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "initialFocus", "finalFocus", "keepMounted", "inline", "container", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const v$fromRoot = __rt.memo("fromRoot", (__prev) => __rt.useGet(v$rootContainer, __o), undefined);
		const v$outer = __rt.memo("outer", (__prev) => __rt.useGet(v$inherited, __o), undefined);
		const v$named = __rt.memo("named", (__prev) => ({
			"initialFocus": v$initialFocus(),
			"finalFocus": v$finalFocus(),
			"keepMounted": v$keepMounted(),
			"inline": v$inline()
		}), undefined);
		const v$$$4 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "content"), v$named, v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$4()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$4()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$4()?.now, undefined);
		const v$tick = __rt.memo("tick", (__prev) => v$$$4()?.tick, undefined);
		const v$present = __rt.memo("present", (__prev) => v$presentOf(v$part(), v$named(), v$scope()?.options, v$tick()), undefined);
		return _$Show(new _P$15(v$present, __rt, (__item) => {
			const n$present = __item;
			const __o = __rt.owner();
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({
				"ref": (v$e) => {
					__rt.snapshot(v$bind)(v$e);
					v$give(__rt.snapshot(v$user), v$e);
				},
				"onKeyDown": (v$e) => {
					v$fire(__rt.snapshot(v$part), "keydown", v$e, v$props?.onKeyDown);
				}
			}), undefined);
			return V$Popup(new _P$14(v$container, v$fromRoot, v$outer, v$inline, __rt, V$Viewport, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, v$elementProps));
		}));
	}
	function V$DialogTitle(v$props) {
		const __o = __rt.owner();
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const v$$$5 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "title"), __rt.memo(null, () => ({})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$5()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$5()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$5()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
			__rt.snapshot(v$bind)(v$e);
			v$give(__rt.snapshot(v$user), v$e);
		} }), undefined);
		return _$Show(new _P$16(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
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
	function V$DialogDescription(v$props) {
		const __o = __rt.owner();
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const v$$$6 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "description"), __rt.memo(null, () => ({})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$6()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$6()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$6()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
			__rt.snapshot(v$bind)(v$e);
			v$give(__rt.snapshot(v$user), v$e);
		} }), undefined);
		return _$Show(new _P$17(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
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
	function V$DialogClose(v$props) {
		const __o = __rt.owner();
		const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
		const v$action_ = __rt.memo("action_", (__prev) => v$props?.action, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "value", "action", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$dialog, __o), undefined);
		const r$id = __rt.inst(() => v$uniqueId());
		const v$id = () => r$id;
		const v$$$7 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "close"), __rt.memo(null, () => ({
			"id": v$props?.id ?? v$id(),
			"value": v$value(),
			"action": v$action_()
		})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$7()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$7()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$7()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const v$on_ = __rt.memo("on_", (__prev) => ({
			"ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			},
			"onClick": (v$e) => {
				v$fire(__rt.snapshot(v$part), "click", v$e, v$props?.onClick);
			}
		}), undefined);
		return _$Show(new _P$18(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$now, v$classOf, v$styleOf, (__item) => {
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
	function V$DialogShortcut(v$props) {
		const __o = __rt.owner();
		const v$shortcut = __rt.memo("shortcut", (__prev) => v$props?.shortcut, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "shortcut", "render", "ref"), undefined);
		const v$around = __rt.memo("around", (__prev) => __rt.useGet(v$nearest, __o), undefined);
		const v$within = __rt.memo("within", (__prev) => __rt.useGet(v$trigger, __o), undefined);
		const v$target = __rt.memo("target", (__prev) => v$around() ?? v$within()?.target ?? null, undefined);
		return _$Show(new _P$20(__rt, v$target, (__item) => {
			const __o = __rt.owner();
			const v$$$8 = v$usePart(__rt.memo(null, () => v$target()?.it), __rt.untrack(() => "shortcut"), __rt.memo(null, () => ({ "shortcut": v$shortcut() ?? v$within()?.shortcut })), v$rest, __rt.memo(null, () => v$target()?.options));
			const v$part = __rt.memo("part", (__prev) => v$$$8()?.part, undefined);
			const v$attrs = __rt.memo("attrs", (__prev) => v$$$8()?.attrs, undefined);
			const v$now = __rt.memo("now", (__prev) => v$$$8()?.now, undefined);
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			} }), undefined);
			const v$text = __rt.memo("text", (__prev) => (v$s) => v$s?.text, undefined);
			return _$Show(new _P$19(__rt, v$render, v$rest, v$attrs, v$on_, v$viewOf, v$props, v$text, v$now, v$classOf, v$styleOf, (__item) => {
				const __o = __rt.owner();
				const r$all = __rt.inst(() => v$elementProps(v$rest, __rt.memo(null, () => ({
					...v$attrs(),
					...v$on_(),
					"class": v$classOf(v$props?.class, v$now()),
					"style": v$styleOf(v$props?.style, v$now(), v$attrs()?.style)
				})), __rt.untrack(() => __rt.untrack(() => v$props)), __rt.untrack(() => __rt.untrack(() => v$now())), __rt.untrack(() => v$text())));
				const v$all = () => r$all;
				return _$memo(() => {
					return __rt.show(v$viewOf(v$render()(v$all(), v$now())));
				});
			}));
		}));
	}
	return {
		"Dialog": V$Dialog,
		"DialogTrigger": V$DialogTrigger,
		"DialogBackdrop": V$DialogBackdrop,
		"DialogContent": V$DialogContent,
		"DialogTitle": V$DialogTitle,
		"DialogDescription": V$DialogDescription,
		"DialogClose": V$DialogClose,
		"DialogShortcut": V$DialogShortcut
	};
}
//# sourceMappingURL=dialog.ssr.js.map
