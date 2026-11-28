import { useEffect, useRef, useState } from "react";
import { search } from "./api.js";
import type { Hit } from "./api.js";
import { messageOf } from "./errors";

type State =
  | { status: "searching" }
  | { status: "ok"; hits: Hit[] }
  | { status: "error"; message: string };

/**
 * Help related to an issue, searched by its title. The title is read once, at mount,
 * so renaming the issue does not search again. Remounted for each loaded detail.
 */
export default function RelatedHelp({ title, onOpen }: { title: string; onOpen: (hit: Hit) => void }) {
  const [query] = useState(title);
  const [state, setState] = useState<State>({ status: "searching" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    search(query).then(
      (hits) => setState({ status: "ok", hits }),
      (e: unknown) => setState({ status: "error", message: messageOf(e) }),
    );
  }, [query]);

  return (
    <div data-testid="related">
      {state.status === "searching" && <p>finding related help</p>}
      {state.status === "ok" &&
        (state.hits.length === 0 ? (
          <p>no related help</p>
        ) : (
          <ul>
            {state.hits.slice(0, 3).map((hit) => (
              <li key={hit.id}>
                <button type="button" data-testid="related-hit" onClick={() => onOpen(hit)}>
                  {hit.name}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {state.status === "error" && <p>{`related help failed: ${state.message}`}</p>}
    </div>
  );
}
