import { css } from "@barqjs/css";
import {
  Checkbox,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 20rem;
`;

const plain = css`
  font-weight: 400;
`;

export default function FieldGroupExample() {
  return (
    <FieldGroup class={group}>
      <FieldSet>
        <FieldLabel>Responses</FieldLabel>
        <FieldDescription>
          Get notified when the assistant responds to requests that take time, like research or
          image generation.
        </FieldDescription>
        <FieldGroup data-slot="checkbox-group">
          <Field orientation="horizontal">
            <Checkbox id="field-group-push" defaultChecked disabled />
            <FieldLabel for="field-group-push" class={plain}>
              Push notifications
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLabel>Tasks</FieldLabel>
        <FieldDescription>
          Get notified when tasks you've created have updates. <a href="#">Manage tasks</a>
        </FieldDescription>
        <FieldGroup data-slot="checkbox-group">
          <Field orientation="horizontal">
            <Checkbox id="field-group-push-tasks" />
            <FieldLabel for="field-group-push-tasks" class={plain}>
              Push notifications
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="field-group-email-tasks" />
            <FieldLabel for="field-group-email-tasks" class={plain}>
              Email notifications
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
