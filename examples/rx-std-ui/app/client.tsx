import { hydrate, render } from "@solidjs/web";
import { OBSERVE } from "solid-js";
import { cases, log } from "./cases";
const w = window as any; w.__log = log; w.__diag = [];
try { (OBSERVE as any)?.diagnostics?.subscribe((e: any) => w.__diag.push(e.code)); } catch {}
const name = new URL(location.href).searchParams.get("case")!, root = document.getElementById("app")!, C = cases[name];
w.__unmount = root.firstChild ? hydrate(() => <C />, root) : render(() => <C />, root);
w.__mounted = true;
