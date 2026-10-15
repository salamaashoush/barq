import { css } from "@barqjs/css";
import { DirectionProvider, Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Field>
          <FieldLabel for="input-rtl-api-key">مفتاح API</FieldLabel>
          <Input id="input-rtl-api-key" type="password" placeholder="sk-..." />
          <FieldDescription>مفتاح API الخاص بك مشفر ومخزن بأمان.</FieldDescription>
        </Field>
      </div>
    </DirectionProvider>
  );
}
