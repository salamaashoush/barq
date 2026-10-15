import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldTitle, Slider } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

const figure = css`
  font-weight: 500;
  font-variant-numeric: tabular-nums;
`;

const slider = css`
  width: 100%;
  margin-top: calc(var(--spacing) * 2);
`;

export default function FieldSlider() {
  const [value, setValue] = createSignal([200, 800]);
  const lowest = (): number | undefined => value()[0];
  const highest = (): number | undefined => value()[1];

  return (
    <Field class={field}>
      <FieldTitle>Price Range</FieldTitle>
      <FieldDescription>
        Set your budget range ($<span class={figure}>{lowest()}</span> -{" "}
        <span class={figure}>{highest()}</span>).
      </FieldDescription>
      <Slider
        value={value()}
        onValueChange={setValue}
        max={1000}
        min={0}
        step={10}
        class={slider}
        aria-label="Price Range"
      />
    </Field>
  );
}
