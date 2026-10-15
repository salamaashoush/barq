import { css } from "@barqjs/css";
import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 20rem;
`;

const tight = css`
  gap: calc(var(--spacing) * 3);
`;

const plain = css`
  font-weight: 400;
`;

export default function FieldCheckbox() {
  return (
    <FieldGroup class={group}>
      <FieldSet>
        <FieldLegend variant="label">Show these items on the desktop</FieldLegend>
        <FieldDescription>Select the items you want to show on the desktop.</FieldDescription>
        <FieldGroup class={tight}>
          <Field orientation="horizontal">
            <Checkbox id="field-checkbox-hard-disks" />
            <FieldLabel for="field-checkbox-hard-disks" class={plain}>
              Hard disks
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="field-checkbox-external-disks" />
            <FieldLabel for="field-checkbox-external-disks" class={plain}>
              External disks
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="field-checkbox-optical-discs" />
            <FieldLabel for="field-checkbox-optical-discs" class={plain}>
              CDs, DVDs, and media players
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="field-checkbox-connected-servers" />
            <FieldLabel for="field-checkbox-connected-servers" class={plain}>
              Connected servers
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <Field orientation="horizontal">
        <Checkbox id="field-checkbox-sync-folders" defaultChecked />
        <FieldContent>
          <FieldLabel for="field-checkbox-sync-folders">
            Sync Desktop & Documents folders
          </FieldLabel>
          <FieldDescription>
            Your Desktop & Documents folders are being synced with your cloud storage. You can
            access them from other devices.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}
