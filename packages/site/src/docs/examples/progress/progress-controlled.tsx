import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Progress, Slider } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export default function ProgressControlled() {
  const [value, setValue] = createSignal([50]);

  return (
    <div class={frame}>
      <Progress aria-label="Progress" value={value()[0]} />
      <Slider
        aria-label="Set the progress"
        value={value()}
        onValueChange={(next: number[]) => setValue(next)}
        min={0}
        max={100}
        step={1}
      />
    </div>
  );
}
