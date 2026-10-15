import { css } from "@barqjs/css";
import { Label, RadioGroup, RadioGroupItem } from "@barqjs/ui";

const group = css`
  width: fit-content;
`;

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
`;

export default function RadioGroupDemo() {
  return (
    <RadioGroup defaultValue="comfortable" class={group}>
      <div class={row}>
        <RadioGroupItem value="default" id="radio-group-demo-r1" />
        <Label for="radio-group-demo-r1">Default</Label>
      </div>
      <div class={row}>
        <RadioGroupItem value="comfortable" id="radio-group-demo-r2" />
        <Label for="radio-group-demo-r2">Comfortable</Label>
      </div>
      <div class={row}>
        <RadioGroupItem value="compact" id="radio-group-demo-r3" />
        <Label for="radio-group-demo-r3">Compact</Label>
      </div>
    </RadioGroup>
  );
}
