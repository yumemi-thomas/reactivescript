// A JS host: Solid's own render, TSX, and .rx components from pages.rx (CP-4d).
import { render } from "@solidjs/web";
import { components } from "@reactivescript/runtime";
import pages from "./pages.rx?rx-lib";

const { Counter, PersonCard } = components(pages);

render(() => (
  <main>
    <h1>TSX host</h1>
    <Counter label="clicks" />
    <Counter label="same clicks" />
    <PersonCard id="1" />
    <PersonCard id="9" />
  </main>
), document.getElementById("app")!);
