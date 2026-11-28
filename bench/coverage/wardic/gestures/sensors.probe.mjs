import { DomLive } from "@wardic/dom";
import { WardicProvider } from "@wardic/solid";
export const providers = { wardic: (children, s) => s.createComponent(WardicProvider, { env: DomLive, get children() { return children(); } }) };
