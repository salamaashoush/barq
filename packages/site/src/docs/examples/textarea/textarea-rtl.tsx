import { css } from "@barqjs/css";
import { DirectionProvider, Field, FieldDescription, FieldLabel, Textarea } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
`;

export default function TextareaRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Field>
          <FieldLabel for="textarea-rtl-feedback">التعليقات</FieldLabel>
          <Textarea
            id="textarea-rtl-feedback"
            placeholder="تعليقاتك تساعدنا على التحسين..."
            rows={4}
          />
          <FieldDescription>شاركنا أفكارك حول خدمتنا.</FieldDescription>
        </Field>
      </div>
    </DirectionProvider>
  );
}
