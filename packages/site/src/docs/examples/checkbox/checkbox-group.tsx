import { css } from "@barqjs/css";
import {
  Checkbox,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@barqjs/ui";

const list = css`
  gap: calc(var(--spacing) * 3);
`;

const plain = css`
  font-weight: 400;
`;

export default function CheckboxGroup() {
  return (
    <FieldSet>
      <FieldLegend variant="label">Show these items on the desktop:</FieldLegend>
      <FieldDescription>Select the items you want to show on the desktop.</FieldDescription>
      <FieldGroup class={list}>
        <Field orientation="horizontal">
          <Checkbox
            id="checkbox-group-hard-disks"
            name="checkbox-group-hard-disks"
            defaultChecked
          />
          <FieldLabel for="checkbox-group-hard-disks" class={plain}>
            Hard disks
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="checkbox-group-external-disks"
            name="checkbox-group-external-disks"
            defaultChecked
          />
          <FieldLabel for="checkbox-group-external-disks" class={plain}>
            External disks
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="checkbox-group-cds-dvds" name="checkbox-group-cds-dvds" />
          <FieldLabel for="checkbox-group-cds-dvds" class={plain}>
            CDs, DVDs, and iPods
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="checkbox-group-connected-servers" name="checkbox-group-connected-servers" />
          <FieldLabel for="checkbox-group-connected-servers" class={plain}>
            Connected servers
          </FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
