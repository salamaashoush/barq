import { css } from "@barqjs/css";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Switch,
} from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 24rem;
`;

export default function SwitchChoiceCard() {
  return (
    <FieldGroup class={group}>
      <FieldLabel for="switch-choice-card-share">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Share across devices</FieldTitle>
            <FieldDescription>
              Focus is shared across devices, and turns off when you leave the app.
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-choice-card-share" />
        </Field>
      </FieldLabel>
      <FieldLabel for="switch-choice-card-notifications">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enable notifications</FieldTitle>
            <FieldDescription>
              Receive notifications when focus mode is enabled or disabled.
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-choice-card-notifications" defaultChecked />
        </Field>
      </FieldLabel>
    </FieldGroup>
  );
}
