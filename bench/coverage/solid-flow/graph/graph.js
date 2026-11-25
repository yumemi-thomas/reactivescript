import { createNodeStore, createEdgeStore } from "@dschz/solid-flow";
/** The app's graph: its nodes and edges, as the library's stores. */
export function graph() {
  const [nodes] = createNodeStore([{ id: "a", position: { x: 0, y: 0 }, data: { label: "A" } }, { id: "b", position: { x: 200, y: 100 }, data: { label: "B" } }]);
  const [edges] = createEdgeStore([{ id: "a-b", source: "a", target: "b" }]);
  return { nodes: () => nodes, edges: () => edges };
}
