import { createSignal, Show, For } from "solid-js";
import { SliderProvider, Slider, SliderButton, SliderDots } from "#slider";
export const steps: any = [["click", "#t-n"], ["wait", 900], ["click", "#t-more"], ["wait", 300]];
export default function App() {
  const [v, setV] = createSignal(["a", "b"]);
  return <><SliderProvider><div style="width:300px"><Slider options={{ loop: false }}><For each={v()}>{(k) => <div class="keen-slider__slide" style="min-width:100%">{k}</div>}</For></Slider></div><span id="t-n"><SliderButton next>n</SliderButton></span><SliderDots /></SliderProvider><button id="t-more" onClick={() => setV(["a", "b", "c"])}>m</button></>;
}
