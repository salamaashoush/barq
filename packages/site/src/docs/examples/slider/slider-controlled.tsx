import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Label, Slider } from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
  gap: calc(var(--spacing) * 3);
`;

const header = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 2);
`;

const readout = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function SliderControlled() {
  const [value, setValue] = createSignal([0.3, 0.7]);

  return (
    <div class={frame}>
      <div class={header}>
        <Label id="slider-controlled-temperature-label">Temperature</Label>
        <span class={readout}>{() => value().join(", ")}</span>
      </div>
      <Slider
        aria-labelledby="slider-controlled-temperature-label"
        value={value()}
        onValueChange={(next: number[]) => setValue(next)}
        min={0}
        max={1}
        step={0.1}
      />
    </div>
  );
}
