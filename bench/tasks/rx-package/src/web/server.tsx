// The server's render, as any Solid app writes it: a plain renderToStream. The package's state is the render's (09 MO-13g);
// inside a request (Solid's request event, as a framework provides one) it is the request's.
import { generateHydrationScript, renderToStream, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { Loading } from "solid-js";
import { library } from "@reactivescript/runtime";
import { __rx, code } from "@bench/rates";
import { App } from "./app.tsx";

type Sink = { write(chunk: string): void; end(): void };
export { generateHydrationScript };
export function render(_request: Request, sink: Sink) {
  renderToStream(() => <App />).pipe(sink as never);
}
export function renderInRequest(request: Request, sink: Sink) {
  provideRequestEvent({ request, locals: {} } as never, () => renderToStream(() => <App />).pipe(sink as never));
}

// The package's module again, each instance numbered as it is made: what a render prints tells which instance it read,
// before its rate is known and after.
let made = 0;
const numbered = library(rt => ({ ...__rx(rt), serial: (n => () => n)(++made) }), "bench/numbered") as unknown as { serial(): number; code(): string; rate(): number };
function Probe() {
  return <p>{numbered.serial()}:{numbered.code()} <Loading fallback="…"><b>{numbered.rate()}@{numbered.serial()}</b></Loading></p>;
}
export const probe = (sink: Sink) => { renderToStream(() => <Probe />).pipe(sink as never); };
export const probeInRequest = (sink: Sink) => { provideRequestEvent({ request: new Request("http://localhost/"), locals: {} } as never, () => renderToStream(() => <Probe />).pipe(sink as never)); };
export const probeString = () => renderToString(() => <i>{numbered.serial()}:{numbered.code()}:{numbered.serial()}</i>);
/** An export read where nothing renders and no request is being answered. */
export const outside = () => { try { return code(); } catch (e) { return `threw: ${(e as Error).message}`; } };
