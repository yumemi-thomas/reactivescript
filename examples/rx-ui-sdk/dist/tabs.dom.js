import { template as _$template } from "@solidjs/web";
import { getNextElement as _$getNextElement } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { scope as _$scope } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { spread as _$spread } from "@solidjs/web";
import { runHydrationEvents as _$runHydrationEvents } from "@solidjs/web";
import { Show as _$Show } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<button>`);
var _tmpl$3 = /* @__PURE__ */ _$template(`<span>`);
import __m0 from "./part.dom.js";
import { fire as w$fire, give as w$give, setOptions as w$setOptions } from "./bridge.js";
import { create as w$create, uniqueId as w$uniqueId, own as w$own, binder as w$binder, elementProps as w$elementProps } from "./bridge.js";
import { presentOf as w$presentOf } from "./bridge.js";
import { classOf as w$classOf, styleOf as w$styleOf, viewOf as w$viewOf } from "./bridge.js";
import { tabs as w$primitive } from "./core.js";
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
	const v$own = w$own;
	const v$binder = w$binder;
	const v$elementProps = w$elementProps;
	const v$presentOf = w$presentOf;
	const v$classOf = w$classOf;
	const v$styleOf = w$styleOf;
	const v$viewOf = w$viewOf;
	const v$primitive = w$primitive;
	const v$tabs = __rt.context("tabs", null);
	function V$Tabs(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
			const v$defaultValue = __rt.memo("defaultValue", (__prev) => v$props?.defaultValue, undefined);
			const v$onValueChange = __rt.memo("onValueChange", (__prev) => v$props?.onValueChange, undefined);
			const v$orientation = __rt.memo("orientation", (__prev) => v$props?.orientation, undefined);
			const v$activation = __rt.memo("activation", (__prev) => v$props?.activation, undefined);
			const v$loop = __rt.memo("loop", (__prev) => v$props?.loop, undefined);
			const v$hiddenUntilFound = __rt.memo("hiddenUntilFound", (__prev) => v$props?.hiddenUntilFound, undefined);
			const v$controller = __rt.memo("controller", (__prev) => v$props?.controller, undefined);
			const v$debug = __rt.memo("debug", (__prev) => v$props?.debug, undefined);
			const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
			const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
			const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "value", "defaultValue", "onValueChange", "orientation", "activation", "loop", "hiddenUntilFound", "controller", "debug", "render", "ref"), undefined);
			const v$options = __rt.memo("options", (__prev) => ({
				"value": v$value(),
				"defaultValue": v$defaultValue(),
				"onValueChange": v$onValueChange(),
				"orientation": v$orientation(),
				"activation": v$activation(),
				"loop": v$loop(),
				"hiddenUntilFound": v$hiddenUntilFound(),
				"controller": v$controller(),
				"debug": v$debug()
			}), undefined);
			const r$it = __rt.inst(() => v$create(__rt.untrack(() => v$primitive), v$options));
			const v$it = () => r$it;
			const v$$$1 = v$usePart(v$it, __rt.untrack(() => "root"), __rt.memo(null, () => ({})), v$rest, v$options);
			const v$part = __rt.memo("part", (__prev) => v$$$1()?.part, undefined);
			const v$attrs = __rt.memo("attrs", (__prev) => v$$$1()?.attrs, undefined);
			const v$now = __rt.memo("now", (__prev) => v$$$1()?.now, undefined);
			const r$bind = __rt.inst(() => v$binder(v$part));
			const v$bind = () => r$bind;
			const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({ "ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			} }))));
			const v$on_ = () => r$on_;
			__rt.provide(v$tabs, { get: __rt.memo(null, () => ({
				"it": v$it(),
				"options": v$options()
			})) });
			__rt.effect(2, () => [v$it(), v$options()], ($p) => __rt.untrack(() => {
				return v$setOptions($p[0], $p[1]);
			}));
			return _$createComponent(_$Show, {
				get when() {
					return !__rt.eq(v$render(), undefined);
				},
				get fallback() {
					const __o = __rt.owner();
					return (() => {
						var _el$ = _$getNextElement(_tmpl$);
						_$spread(_el$, [
							v$rest,
							v$attrs,
							v$on_,
							{
								get "class"() {
									return v$classOf(v$props?.class, v$now());
								},
								get style() {
									return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
								}
							}
						], true);
						_$insert(_el$, _$scope(() => {
							return __rt.show(v$viewOf(v$props?.children, v$now()));
						}));
						_$runHydrationEvents();
						return _el$;
					})();
				},
				children: (__item) => {
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
				}
			});
		});
	}
	function V$TabsList(v$props) {
		const __o = __rt.owner();
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$tabs, __o), undefined);
		const v$$$2 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "list"), __rt.memo(null, () => ({})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$2()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$2()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$2()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({
			"ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			},
			"onKeyDown": (v$e) => {
				v$fire(__rt.snapshot(v$part), "keydown", v$e, v$props?.onKeyDown);
			}
		}))));
		const v$on_ = () => r$on_;
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$2 = _$getNextElement(_tmpl$);
					_$spread(_el$2, [
						v$rest,
						v$attrs,
						v$on_,
						{
							get "class"() {
								return v$classOf(v$props?.class, v$now());
							},
							get style() {
								return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
							}
						}
					], true);
					_$insert(_el$2, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$2;
				})();
			},
			children: (__item) => {
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
			}
		});
	}
	function V$TabsTab(v$props) {
		const __o = __rt.owner();
		const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
		const v$disabled = __rt.memo("disabled", (__prev) => v$props?.disabled, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "value", "disabled", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$tabs, __o), undefined);
		const v$$$3 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "tab"), __rt.memo(null, () => ({
			"value": v$value(),
			"disabled": v$disabled()
		})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$3()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$3()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$3()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({
			"ref": (v$e) => {
				__rt.snapshot(v$bind)(v$e);
				v$give(__rt.snapshot(v$user), v$e);
			},
			"onClick": (v$e) => {
				v$fire(__rt.snapshot(v$part), "click", v$e, v$props?.onClick);
			}
		}))));
		const v$on_ = () => r$on_;
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$3 = _$getNextElement(_tmpl$2);
					_$spread(_el$3, [
						v$rest,
						v$attrs,
						v$on_,
						{
							get "class"() {
								return v$classOf(v$props?.class, v$now());
							},
							get style() {
								return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
							}
						}
					], true);
					_$insert(_el$3, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$3;
				})();
			},
			children: (__item) => {
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
			}
		});
	}
	function V$TabsTabIcon(v$props) {
		const __o = __rt.owner();
		const v$mirror = __rt.memo("mirror", (__prev) => v$props?.mirror, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "mirror", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$tabs, __o), undefined);
		const r$id = __rt.inst(() => v$uniqueId());
		const v$id = () => r$id;
		const v$$$4 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "tab-icon"), __rt.memo(null, () => ({
			"mirror": v$mirror(),
			"id": v$props?.id ?? v$id()
		})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$4()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$4()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$4()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({ "ref": (v$e) => {
			__rt.snapshot(v$bind)(v$e);
			v$give(__rt.snapshot(v$user), v$e);
		} }))));
		const v$on_ = () => r$on_;
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$4 = _$getNextElement(_tmpl$3);
					_$spread(_el$4, [
						v$rest,
						v$attrs,
						v$on_,
						{
							get "class"() {
								return v$classOf(v$props?.class, v$now());
							},
							get style() {
								return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
							}
						}
					], true);
					_$insert(_el$4, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$4;
				})();
			},
			children: (__item) => {
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
			}
		});
	}
	function V$TabsIndicator(v$props) {
		const __o = __rt.owner();
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$tabs, __o), undefined);
		const v$$$5 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "indicator"), __rt.memo(null, () => ({})), v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$5()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$5()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$5()?.now, undefined);
		const r$bind = __rt.inst(() => v$binder(v$part));
		const v$bind = () => r$bind;
		const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({ "ref": (v$e) => {
			__rt.snapshot(v$bind)(v$e);
			v$give(__rt.snapshot(v$user), v$e);
		} }))));
		const v$on_ = () => r$on_;
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$5 = _$getNextElement(_tmpl$3);
					_$spread(_el$5, [
						v$rest,
						v$attrs,
						v$on_,
						{
							get "class"() {
								return v$classOf(v$props?.class, v$now());
							},
							get style() {
								return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
							}
						}
					], true);
					_$insert(_el$5, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$5;
				})();
			},
			children: (__item) => {
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
			}
		});
	}
	function V$TabsPanel(v$props) {
		const __o = __rt.owner();
		const v$value = __rt.memo("value", (__prev) => v$props?.value, undefined);
		const v$keepMounted = __rt.memo("keepMounted", (__prev) => v$props?.keepMounted, undefined);
		const v$hiddenUntilFound = __rt.memo("hiddenUntilFound", (__prev) => v$props?.hiddenUntilFound, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "value", "keepMounted", "hiddenUntilFound", "render", "ref"), undefined);
		const v$scope = __rt.memo("scope", (__prev) => __rt.useGet(v$tabs, __o), undefined);
		const v$named = __rt.memo("named", (__prev) => ({
			"value": v$value(),
			"keepMounted": v$keepMounted(),
			"hiddenUntilFound": v$hiddenUntilFound()
		}), undefined);
		const v$$$6 = v$usePart(__rt.memo(null, () => v$scope()?.it), __rt.untrack(() => "panel"), v$named, v$rest, __rt.memo(null, () => v$scope()?.options));
		const v$part = __rt.memo("part", (__prev) => v$$$6()?.part, undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$$$6()?.attrs, undefined);
		const v$now = __rt.memo("now", (__prev) => v$$$6()?.now, undefined);
		const v$tick = __rt.memo("tick", (__prev) => v$$$6()?.tick, undefined);
		const v$present = __rt.memo("present", (__prev) => v$presentOf(v$part(), v$named(), v$scope()?.options, v$tick()), undefined);
		return _$createComponent(_$Show, {
			get when() {
				return v$present();
			},
			get fallback() {
				const __o = __rt.owner();
				return null;
			},
			children: (__item) => {
				const n$present = __item;
				const __o = __rt.owner();
				const r$bind = __rt.inst(() => v$binder(v$part));
				const v$bind = () => r$bind;
				const r$on_ = __rt.inst(() => v$own(__rt.untrack(() => ({ "ref": (v$e) => {
					__rt.snapshot(v$bind)(v$e);
					v$give(__rt.snapshot(v$user), v$e);
				} }))));
				const v$on_ = () => r$on_;
				return _$createComponent(_$Show, {
					get when() {
						return !__rt.eq(v$render(), undefined);
					},
					get fallback() {
						const __o = __rt.owner();
						return (() => {
							var _el$6 = _$getNextElement(_tmpl$);
							_$spread(_el$6, [
								v$rest,
								v$attrs,
								v$on_,
								{
									get "class"() {
										return v$classOf(v$props?.class, v$now());
									},
									get style() {
										return v$styleOf(v$props?.style, v$now(), v$attrs()?.style);
									}
								}
							], true);
							_$insert(_el$6, _$scope(() => {
								return __rt.show(v$viewOf(v$props?.children, v$now()));
							}));
							_$runHydrationEvents();
							return _el$6;
						})();
					},
					children: (__item) => {
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
					}
				});
			}
		});
	}
	return {
		"Tabs": V$Tabs,
		"TabsList": V$TabsList,
		"TabsTab": V$TabsTab,
		"TabsTabIcon": V$TabsTabIcon,
		"TabsIndicator": V$TabsIndicator,
		"TabsPanel": V$TabsPanel
	};
}
//# sourceMappingURL=tabs.dom.js.map
