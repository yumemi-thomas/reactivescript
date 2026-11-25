export default {
  imports: [["SliderProvider, Slider, SliderButton, SliderDots", "#slider"]],
  state: [["on", "number", "0"]],
  part: "<SliderProvider><Slider options={{ loop: true }}><div class=\"keen-slider__slide\">CHILD</div></Slider><SliderButton next={true}>n</SliderButton><SliderDots /></SliderProvider><button onClick={() => { $on := 2 }}>b</button>",
  handler: ["onClick={() => { $on := 2 }}", "onClick"],
  wrong: ["<SliderButton ", "<SliderButton disabled={$list} "],
  unknown: ["<SliderDots ", "<SliderDots dotClas=\"x\" "],
  tag: "<div class=\"keen-slider__slide\"",
  outside: "<SliderDots />",
  el: "HTMLDivElement",
  attrs: false,
};
