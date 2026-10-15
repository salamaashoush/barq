import { css } from "@barqjs/css";
import { Checkbox, Label } from "@barqjs/ui";

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
`;

export default function LabelDemo() {
  return (
    <div class={row}>
      <Checkbox id="label-demo-terms" />
      <Label for="label-demo-terms">Accept terms and conditions</Label>
    </div>
  );
}
