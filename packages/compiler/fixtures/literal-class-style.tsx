export default function LiteralClassStyle() {
  const base = "btn"
  return (
    <div>
      <button type="button" class={`${base} ${base}--primary`}>
        concat
      </button>
      <span class={true ? "on" : "off"}>ternary</span>
      <i style="color: red; font-weight: bold">literal style</i>
    </div>
  )
}

export const optimality = {
  target: 3,
  milestone: 3,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  emits: ['class="btn btn--primary"', 'class="on"', 'style="color: red; font-weight: bold"'],
  // The binding too, not just the interpolation: P3 folded the only read of
  // `base`, so the declaration left behind is code nothing evaluates.
  absent: ["${base}", "const base ="],
}
