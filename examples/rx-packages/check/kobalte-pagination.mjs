export default {
  imports: [["Root, Items, Item, Next, Ellipsis", "#kobalte/pagination"]],
  state: [["on", "number", "1"]],
  part: "<Root count={9} page={$on} onPageChange={(v: number) => { $on := v }} itemComponent={(p) => <Item page={p.page}>{p.page}</Item>} ellipsisComponent={() => <Ellipsis>\u2026</Ellipsis>}><Items /><Next>CHILD</Next></Root>",
  rxPart: "<Root count={9} page={$on} onPageChange={(v: number) => { $on := v }}>{view itemComponent (p) { <Item page={p.page}>{p.page}</Item> }}{view ellipsisComponent () { <Ellipsis>\u2026</Ellipsis> }}<Items /><Next>CHILD</Next></Root>",
  handler: ["onPageChange={(v: number) => { $on := v }}", "onPageChange"],
  wrong: ["page={$on}", "page={$list}"],
  unknown: ["count={9}", ""],
  tag: "<Next",
  outside: "<Next>n</Next>",
  el: "HTMLButtonElement",
};
