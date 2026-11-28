import { template as _$template } from "@solidjs/web";
import { getNextElement as _$getNextElement } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { scope as _$scope } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { spread as _$spread } from "@solidjs/web";
import { mergeProps as _$mergeProps } from "@solidjs/web";
import { runHydrationEvents as _$runHydrationEvents } from "@solidjs/web";
import { Show as _$Show } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<button>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div>`);
var _tmpl$3 = /* @__PURE__ */ _$template(`<h2>`);
var _tmpl$4 = /* @__PURE__ */ _$template(`<p>`);
var _tmpl$5 = /* @__PURE__ */ _$template(`<span>`);
import __m0 from "./part.dom.js";
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
			return _$createComponent(_$Show, {
				get when() {
					return !__rt.eq(v$target(), null);
				},
				get fallback() {
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
					return _$createComponent(_$Show, {
						get when() {
							return typeof v$props.element === "function";
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
											return v$styleOf(v$props?.style, v$now(), undefined);
										}
									}
								], true);
								_$insert(_el$, _$scope(() => {
									return __rt.view(v$props.children, (V$view) => _$createComponent(V$view, _$mergeProps(() => {
										return v$now();
									})), true);
								}));
								_$runHydrationEvents();
								return _el$;
							})();
						},
						children: (__item) => {
							const __o = __rt.owner();
							return _$memo(() => {
								return __rt.view(v$props.element, (V$view) => _$createComponent(V$view, {
									get attrs() {
										return {
											...v$rest(),
											...v$attrs(),
											...v$on_(),
											"class": v$classOf(v$props?.class, v$now()),
											"style": v$styleOf(v$props?.style, v$now(), undefined)
										};
									},
									get state() {
										return v$now();
									}
								}));
							});
						}
					});
				},
				children: (__item) => {
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
					return _$createComponent(_$Show, {
						get when() {
							return typeof v$props.element === "function";
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
									return __rt.view(v$props.children, (V$view) => _$createComponent(V$view, _$mergeProps(() => {
										return v$now();
									})), true);
								}));
								_$runHydrationEvents();
								return _el$2;
							})();
						},
						children: (__item) => {
							const __o = __rt.owner();
							return _$memo(() => {
								return __rt.view(v$props.element, (V$view) => _$createComponent(V$view, {
									get attrs() {
										return {
											...v$rest(),
											...v$attrs(),
											...v$on_(),
											"class": v$classOf(v$props?.class, v$now()),
											"style": v$styleOf(v$props?.style, v$now(), v$attrs()?.style)
										};
									},
									get state() {
										return v$now();
									}
								}));
							});
						}
					});
				}
			});
		});
	}
	function V$Popup(v$props) {
		return __rt.inst(() => {
			const __o = __rt.owner();
			const v$target = __rt.memo("target", (__prev) => v$props?.inline ? null : v$portalTarget(v$props?.inside), undefined);
			__rt.provide(v$inherited, { get: __rt.memo(null, () => v$props?.inside) });
			return _$createComponent(_$Show, {
				get when() {
					return !__rt.eq(v$target(), null);
				},
				get fallback() {
					const __o = __rt.owner();
					return _$memo(() => {
						return __rt.kids(v$props?.children);
					});
				},
				children: (__item) => {
					const __o = __rt.owner();
					return _$createComponent(V$Portal, {
						get mount() {
							return v$target();
						},
						get children() {
							return __rt.kids(v$props?.children);
						}
					});
				}
			});
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
		return _$createComponent(_$Show, {
			get when() {
				return v$present();
			},
			get fallback() {
				const __o = __rt.owner();
				return _$memo(() => {
					return __rt.kids(v$props?.children);
				});
			},
			children: (__item) => {
				const n$present = __item;
				const __o = __rt.owner();
				const r$bind = __rt.inst(() => v$binder(v$part));
				const v$bind = () => r$bind;
				const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
					__rt.snapshot(v$bind)(v$e);
				} }), undefined);
				return (() => {
					var _el$3 = _$getNextElement(_tmpl$2);
					_$spread(_el$3, [v$attrs, v$on_], true);
					_$insert(_el$3, _$scope(() => {
						return __rt.kids(v$props?.children);
					}));
					_$runHydrationEvents();
					return _el$3;
				})();
			}
		});
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
				const v$on_ = __rt.memo("on_", (__prev) => ({ "ref": (v$e) => {
					__rt.snapshot(v$bind)(v$e);
					v$give(__rt.snapshot(v$user), v$e);
				} }), undefined);
				return _$createComponent(V$Popup, {
					get inside() {
						return v$own_() ?? v$outer();
					},
					get children() {
						return __rt.slot(() => {
							const __o = __rt.owner();
							return _$createComponent(_$Show, {
								get when() {
									return !__rt.eq(v$render(), undefined);
								},
								get fallback() {
									const __o = __rt.owner();
									return (() => {
										var _el$4 = _$getNextElement(_tmpl$2);
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
						});
					}
				});
			}
		});
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
				const v$on_ = __rt.memo("on_", (__prev) => ({
					"ref": (v$e) => {
						__rt.snapshot(v$bind)(v$e);
						v$give(__rt.snapshot(v$user), v$e);
					},
					"onKeyDown": (v$e) => {
						v$fire(__rt.snapshot(v$part), "keydown", v$e, v$props?.onKeyDown);
					}
				}), undefined);
				return _$createComponent(V$Popup, {
					get inside() {
						return v$container() ?? v$fromRoot() ?? v$outer();
					},
					get inline() {
						return v$inline();
					},
					get children() {
						return __rt.slot(() => {
							const __o = __rt.owner();
							return _$createComponent(V$Viewport, { get children() {
								return __rt.slot(() => {
									const __o = __rt.owner();
									return _$createComponent(_$Show, {
										get when() {
											return !__rt.eq(v$render(), undefined);
										},
										get fallback() {
											const __o = __rt.owner();
											return (() => {
												var _el$5 = _$getNextElement(_tmpl$2);
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
								});
							} });
						});
					}
				});
			}
		});
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
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$6 = _$getNextElement(_tmpl$3);
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
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$7 = _$getNextElement(_tmpl$4);
					_$spread(_el$7, [
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
					_$insert(_el$7, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$7;
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
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$render(), undefined);
			},
			get fallback() {
				const __o = __rt.owner();
				return (() => {
					var _el$8 = _$getNextElement(_tmpl$);
					_$spread(_el$8, [
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
					_$insert(_el$8, _$scope(() => {
						return __rt.show(v$viewOf(v$props?.children, v$now()));
					}));
					_$runHydrationEvents();
					return _el$8;
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
	function V$DialogShortcut(v$props) {
		const __o = __rt.owner();
		const v$shortcut = __rt.memo("shortcut", (__prev) => v$props?.shortcut, undefined);
		const v$render = __rt.memo("render", (__prev) => v$props?.render, undefined);
		const v$user = __rt.memo("user", (__prev) => v$props?.ref, undefined);
		const v$rest = __rt.memo("rest", (__prev) => __rt.omit(v$props, "shortcut", "render", "ref"), undefined);
		const v$around = __rt.memo("around", (__prev) => __rt.useGet(v$nearest, __o), undefined);
		const v$within = __rt.memo("within", (__prev) => __rt.useGet(v$trigger, __o), undefined);
		const v$target = __rt.memo("target", (__prev) => v$around() ?? v$within()?.target ?? null, undefined);
		return _$createComponent(_$Show, {
			get when() {
				return !__rt.eq(v$target(), null);
			},
			get fallback() {
				const __o = __rt.owner();
				return null;
			},
			children: (__item) => {
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
				return _$createComponent(_$Show, {
					get when() {
						return !__rt.eq(v$render(), undefined);
					},
					get fallback() {
						const __o = __rt.owner();
						return (() => {
							var _el$9 = _$getNextElement(_tmpl$5);
							_$spread(_el$9, [
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
							_$insert(_el$9, _$scope(() => {
								return __rt.show(v$viewOf(v$props?.children ?? v$text(), v$now()));
							}));
							_$runHydrationEvents();
							return _el$9;
						})();
					},
					children: (__item) => {
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
					}
				});
			}
		});
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
//# sourceMappingURL=dialog.dom.js.map
