import { listen as w$listen } from "./bridge.js";
import { partOf as w$partOf, attrsOf as w$attrsOf, stateOf as w$stateOf } from "./bridge.js";
export default function module(__rt) {
	const __B = __rt.B;
	if (!__rt.result) throw Error("part.rx: a package compiled by this version of ReactiveScript needs @reactivescript/runtime of the same version or newer: upgrade it in the app (09 MO-13i)");
	const __o = __rt.owner();
	const v$listen = w$listen;
	const v$partOf = w$partOf;
	const v$attrsOf = w$attrsOf;
	const v$stateOf = w$stateOf;
	function v$usePart(v$it, v$slot, v$named, v$user, v$options) {
		const __o = __rt.owner();
		const [v$tick, w$tick] = __rt.source("tick", __rt.untrack(() => 0));
		const [v$attrsTick, w$attrsTick] = __rt.source("attrsTick", __rt.untrack(() => 0));
		const v$part = __rt.memo("part", (__prev) => v$partOf(v$it(), v$slot, v$named()), undefined);
		const v$attrs = __rt.memo("attrs", (__prev) => v$attrsOf(v$part(), v$named(), v$user(), v$options(), v$attrsTick()), undefined);
		const r$now = __rt.inst(() => v$stateOf(v$part, v$named, v$options, v$tick));
		const v$now = () => r$now;
		__rt.effect(1, () => [v$part()], ($p) => __rt.untrack(() => {
			return v$listen($p[0], (v$live) => {
				w$tick.set((v$t) => v$t + 1);
				if (!v$live) {
					w$attrsTick.set((v$t) => v$t + 1);
				} else {}
			});
		}));
		return __rt.result(this, () => __rt.memo(null, () => ({
			"part": v$part(),
			"attrs": v$attrs(),
			"now": v$now(),
			"tick": v$tick()
		})), () => ({
			"part": v$part,
			"attrs": v$attrs,
			"now": __rt.untrack(() => v$now()),
			"tick": v$tick
		}));
	}
	return { "usePart": v$usePart };
}
//# sourceMappingURL=part.dom.js.map
