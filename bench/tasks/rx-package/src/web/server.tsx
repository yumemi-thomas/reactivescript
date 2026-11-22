// The server's render: inside a request, as a framework's is (Solid's request event) — the package's state is the request's.
import { generateHydrationScript, renderToStream } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { App } from "./app.tsx";

export { generateHydrationScript };
export function render(request: Request, sink: { write(chunk: string): void; end(): void }) {
  provideRequestEvent({ request, locals: {} } as never, () => renderToStream(() => <App />).pipe(sink as never));
}
