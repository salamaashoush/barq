import { css } from "@barqjs/css";
import { Checkbox, DirectionProvider, Label } from "@barqjs/ui";

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
`;

export default function LabelRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <Checkbox id="label-rtl-terms" />
        <Label for="label-rtl-terms">قبول الشروط والأحكام</Label>
      </div>
    </DirectionProvider>
  );
}
