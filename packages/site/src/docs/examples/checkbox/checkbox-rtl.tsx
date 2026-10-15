import { css } from "@barqjs/css";
import {
  Checkbox,
  DirectionProvider,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Label,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 24rem;
`;

const acceptTerms = "قبول الشروط والأحكام";
const acceptTermsDescription = "بالنقر على هذا المربع، فإنك توافق على الشروط.";
const enableNotifications = "تفعيل الإشعارات";
const enableNotificationsDescription = "يمكنك تفعيل أو إلغاء تفعيل الإشعارات في أي وقت.";

export default function CheckboxRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="checkbox-rtl-terms" name="checkbox-rtl-terms" />
            <Label for="checkbox-rtl-terms">{acceptTerms}</Label>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="checkbox-rtl-terms-2" name="checkbox-rtl-terms-2" defaultChecked />
            <FieldContent>
              <FieldLabel for="checkbox-rtl-terms-2">{acceptTerms}</FieldLabel>
              <FieldDescription>{acceptTermsDescription}</FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal" isDisabled>
            <Checkbox id="checkbox-rtl-toggle" name="checkbox-rtl-toggle" disabled />
            <FieldLabel for="checkbox-rtl-toggle">{enableNotifications}</FieldLabel>
          </Field>
          <FieldLabel>
            <Field orientation="horizontal">
              <Checkbox id="checkbox-rtl-toggle-2" name="checkbox-rtl-toggle-2" />
              <FieldContent>
                <FieldTitle>{enableNotifications}</FieldTitle>
                <FieldDescription>{enableNotificationsDescription}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        </FieldGroup>
      </div>
    </DirectionProvider>
  );
}
