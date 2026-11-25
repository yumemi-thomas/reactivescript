import { createSignal, For, Show } from "solid-js";
import { Toggle, ToggleGroup } from "@ui-sdk/solid/toggle";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@ui-sdk/solid/tabs";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "@ui-sdk/solid/dialog";
export default function App() {
  const [bold, setBold] = createSignal(false); const [align, setAlign] = createSignal<string[]>(["left"]); const [tab, setTab] = createSignal<string | null>("one"); const [open, setOpen] = createSignal(false); const [extra, setExtra] = createSignal(false); const [clicks, setClicks] = createSignal(0);
  return <>
  <p id="seen">{bold() ? "bold" : "plain"} {align().join("+")} {tab()} {open() ? "open" : "shut"} {clicks()}</p>
  <Toggle id="bold" class="t" pressed={bold()} onPressedChange={(p: boolean) => { setBold(p) }} onClick={() => { setClicks((n) => n + 1) }}>{bold() ? "B!" : "B"}</Toggle>
  <ToggleGroup id="align" value={align()} onValueChange={(v: string[]) => { setAlign(v) }}>
    <For each={["left", "right"]}>{(side) => <Toggle id={side} value={side}>{side}</Toggle>}</For>
  </ToggleGroup>
  <button id="extra" onClick={() => { setExtra((x) => !x) }}>extra</button>
  <Tabs value={tab()} onValueChange={(v: string | null) => { setTab(v) }}>
    <TabsList aria-label="n">
      <TabsTab value="one">One</TabsTab>
      <TabsTab value="two">Two</TabsTab>
      <Show when={extra()}><TabsTab value="three">Three</TabsTab></Show>
    </TabsList>
    <TabsPanel value="one">first</TabsPanel>
    <TabsPanel value="two">second</TabsPanel>
  </Tabs>
  <Dialog open={open()} onOpenChange={(o: boolean) => { setOpen(o) }}>
    <DialogTrigger id="trigger">Open</DialogTrigger>
    <DialogContent id="content"><DialogTitle>Title</DialogTitle><DialogClose id="close">Close</DialogClose></DialogContent>
  </Dialog>
  </>;
}
