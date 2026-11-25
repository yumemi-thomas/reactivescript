import { createSignal, Show, For } from "solid-js";
import { Tooltip, TooltipTrigger, TooltipContent } from "#ui-sdk/tooltip";
export const steps: any = [["focus", "#t-o"], ["wait", 300], ["key", "Escape"], ["hover", "#t-o"], ["wait", 900]];
export default function App() {
  
  return <><Tooltip delay={100}><TooltipTrigger id="t-o">o</TooltipTrigger><TooltipContent>tip</TooltipContent></Tooltip></>;
}
