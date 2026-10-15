import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Switch,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const label = "المشاركة عبر الأجهزة";
const description = "يتم مشاركة التركيز عبر الأجهزة، ويتم إيقاف تشغيله عند مغادرة التطبيق.";

export default function SwitchRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel for="switch-rtl-focus-mode">{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
          </FieldContent>
          <Switch id="switch-rtl-focus-mode" />
        </Field>
      </div>
    </DirectionProvider>
  );
}
