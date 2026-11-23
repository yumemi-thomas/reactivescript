// What `rx-verify` runs toasts.d.rx against (09 MO-11r, MO-11u, MO-12): a region with its list, and — once that is
// mounted — a toast handed to `show`. The row says `renders(Toast.List)`: the toast must render beneath the list.
// A toast's parts read the toast's own context, and a toast the region's: `around` renders a part inside both.
import { Toast } from "./toasts.js";
let Saved;
export const scene = (lib, h) => {
  Saved = h.component("Saved", props => h.s.createComponent(lib.Toast, { toastId: props.toastId, get children() { return h.s.createComponent(lib.Toast.Title, { children: "saved" }); } }));
  return () => h.s.createComponent(lib.Toast.Region, { get children() { return h.s.createComponent(lib.Toast.List, {}); } });
};
export const act = lib => { lib.show(Saved); };
export const probes = {
  Toast: { props: () => ({ toastId: 0 }), around: (children, s) => s.createComponent(Toast.Region, { get children() { return s.createComponent(Toast, { toastId: 0, get children() { return children(); } }); } }) },
};
