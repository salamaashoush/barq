import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  RadioGroup,
  RadioGroupItem,
} from "@barqjs/ui";

const frame = css`
  width: fit-content;
`;

const labels = {
  default: "افتراضي",
  defaultDescription: "تباعد قياسي لمعظم حالات الاستخدام.",
  comfortable: "مريح",
  comfortableDescription: "مساحة أكبر بين العناصر.",
  compact: "مضغوط",
  compactDescription: "تباعد أدنى للتخطيطات الكثيفة.",
};

export default function RadioGroupRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <RadioGroup defaultValue="comfortable">
          <Field orientation="horizontal">
            <RadioGroupItem value="default" id="radio-group-rtl-r1" />
            <FieldContent>
              <FieldLabel for="radio-group-rtl-r1">{labels.default}</FieldLabel>
              <FieldDescription>{labels.defaultDescription}</FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="comfortable" id="radio-group-rtl-r2" />
            <FieldContent>
              <FieldLabel for="radio-group-rtl-r2">{labels.comfortable}</FieldLabel>
              <FieldDescription>{labels.comfortableDescription}</FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="compact" id="radio-group-rtl-r3" />
            <FieldContent>
              <FieldLabel for="radio-group-rtl-r3">{labels.compact}</FieldLabel>
              <FieldDescription>{labels.compactDescription}</FieldDescription>
            </FieldContent>
          </Field>
        </RadioGroup>
      </div>
    </DirectionProvider>
  );
}
